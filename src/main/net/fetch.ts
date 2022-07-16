import { convertObjectKeysToLowerCase } from '@main/utils';
import { Agent } from 'http';
import nodeFetch, {
    FetchError,
    RequestInfo,
    RequestInit,
    Response
} from 'node-fetch';
import { CookieJar } from 'tough-cookie';
import iconv from "iconv-lite"
import { Logger } from '@utils/logger';
import AbortController from 'abort-controller';

export type Headers = Record<string, string>;

export type FetchWrapper = (
    url: RequestInfo,
    options?: RequestInit
) => Promise<Response>;

const userAgentRe = /^User-Agent$/i;

const redirectCodes = new Set([303, 301, 302, 307]);

const fetchGlobalConfig: RequestInit = {}

export class HttpProxyError extends Error {
    public static readonly ERROR_NAME = "EPROXY";
    public static readonly PROXY_HTTP_CODES = [
        407,
        401
    ];

    public code: string;

    constructor(
        public message: string,
        public httpCode: number
    ) {
        super(message);
        this.code = String(httpCode);
        Error.captureStackTrace(this, this.constructor);
    }
}

const findUserAgent = (headers?: Headers): string | undefined => {
    if (!headers) {
        return undefined;
    }

    const key = Object.keys(headers)
        .find((header): boolean => userAgentRe.test(header));

    if (!key) {
        return undefined;
    }

    return headers[key];
};

export const fetch = async (
    url: RequestInfo,
    options: RequestInit = {}
): Promise<Response> => {
    const mixedOptions: RequestInit = {
        ...fetchGlobalConfig,
        ...options,
        headers: {
            ...convertObjectKeysToLowerCase(fetchGlobalConfig.headers),
            ...convertObjectKeysToLowerCase(options.headers)
        }
    }

    return nodeFetch(url, mixedOptions).then(response => {
        if (!response.ok && HttpProxyError.PROXY_HTTP_CODES.includes(response.status)) {
            throw new FetchError(
                response.statusText,
                HttpProxyError.ERROR_NAME,
                new HttpProxyError(response.statusText, response.status)
            );
        }

        const contentType = response.headers.get("content-type");
        if (!contentType) return response;
        if (contentType.includes("charset=windows-1251")) {
            return transformWindows1251ToUTF8(response);
        }

        return response;
    })
}

export const createCookieFollowRedirects = (
    jar: CookieJar,
    initOptions: RequestInit = {}
): FetchWrapper => {
    const fetchWithRedirects = fetchCookieFollowRedirectsDecorator(jar);
    return (url: RequestInfo, options: RequestInit = {}) => {
        const mixedOptions = mixRequestOptions(initOptions, options);
        return fetchWithRedirects(url, mixedOptions);
    }
}

export const fetchCookieDecorator = (jar = new CookieJar()): FetchWrapper => (
    async function fetchCookie(
        url: RequestInfo,
        options: RequestInit = {}
    ): Promise<Response> {
        const previousCookie = await jar.getCookieString(String(url));

        const { headers = {} } = options as {
            headers: Headers;
        };

        if (previousCookie) {
            headers.cookie = previousCookie;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        const { 'set-cookie': cookies = [] } = response.headers.raw();

        if (cookies.length === 0) {
            return response;
        }

        await Promise.all(cookies.map((cookie: string): Promise<unknown> => (
            jar.setCookie(cookie, response.url)
        )));

        return response;
    }
);

export const fetchCookieFollowRedirectsDecorator = (jar?: CookieJar): FetchWrapper => {
    const fetchCookie = fetchCookieDecorator(jar);

    return async function fetchCookieFollowRedirects(
        url: RequestInfo,
        options: RequestInit = {}
    ): Promise<Response> {
        const response = await fetchCookie(url, {
            ...options,
            redirect: 'manual'
        });

        const isRedirect = redirectCodes.has(response.status);
        if (isRedirect && options.redirect !== 'manual' && options.follow !== 0) {
            const location = response.headers.get('location');

            if (!location) {
                throw new Error('Location header missing');
            }

            let follow;
            if (options.follow) {
                follow = options.follow - 1;
            }

            const userAgent = findUserAgent(options.headers as Headers);

            const headers: Headers = userAgent !== undefined
                ? { 'User-Agent': userAgent }
                : {};

            const redirectResponse = await fetchCookieFollowRedirects(location, {
                method: 'GET',
                body: undefined,
                agent: options.agent,
                headers,
                follow
            });

            return redirectResponse;
        }

        return response;
    };
};

export const setFetchGlobalAgent = (agent: Agent | ((parsedUrl: URL) => Agent) | undefined) => {
    fetchGlobalConfig.agent = agent;
}

export const createFetchTimeout = (ms: number = 0) => (url: RequestInfo, options: RequestInit) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return fetch(url, {
        ...options,
        signal: controller.signal
    }).finally(() => clearTimeout(id));
}

function mixRequestOptions(a: RequestInit, b: RequestInit): RequestInit {
    return {
        ...a,
        ...b,
        headers: {
            ...convertObjectKeysToLowerCase(a.headers),
            ...convertObjectKeysToLowerCase(b.headers)
        }
    }
}

async function transformWindows1251ToUTF8(response: Response) {
    const buffer: any = await response.buffer();
    const body = iconv.decode(
        Buffer.from(buffer, 'binary'), 'cp1251'
    ).toString();
    return new Response(body, response);

}