import { ParseException } from "@main/exceptions/parse_exception";
import { CookieJarExtension, fetch, fetchCookieFollowRedirectsDecorator, ILAProxy } from "@main/net";
import { IAgentData, IUserInfo } from "@main/types";
import {
    getRandomElement, getRandomString,
    normalizeJson, randomMobileUserAgent,
    VK_BASE_URL, VK_USER_INFO_URL
} from "@main/utils";
import { Cookie } from "tough-cookie";
import parser from "fast-xml-parser";
import { RequestInfo, RequestInit } from "node-fetch";
import AbortController from "abort-controller";

const MVK_OPTIONS_PATTERN = /vk(?:\s+)?=(?:\s+)?({[^;]+})/;
const MVK_R3MAIL_PATTERN = /src="(https:\/\/r3\.mail\.ru(?:[^"]+))/;
const MVK_COUNTER_URL_PATTERN = /top-fwz1\.mail\.ru\/counter.+?id=(\d+)/;

const MVK_PAGES = ["feed", "mail", "menu"];

interface IVKConnectionConfig {
    jar?: CookieJarExtension;
    proxy?: ILAProxy;
    agent?: IAgentData;
}

const createVKCookie = (key: string, options: Cookie.Properties & { value: string }) => (
    new Cookie({
        key,
        domain: "vk.com",
        ...options
    })
);

const appendCookie = (jar: CookieJarExtension, cookie: Cookie) => (
    jar.setCookie(cookie, VK_BASE_URL)
);

const parseBrowserData = (html: string) => {
    const matched = html.match(MVK_OPTIONS_PATTERN);

    if (!matched) {
        throw new ParseException({
            message: "Parse vk browser data error",
            payload: { html, pattern: MVK_OPTIONS_PATTERN }
        });
    }

    return normalizeJson(matched[1]);
}

const parseR3MailUrl = (html: string) => {
    const matched = html.match(MVK_R3MAIL_PATTERN);
    if (!matched) {
        throw new ParseException({
            message: "Parse r3.mail.ru url error",
            payload: { html, pattern: MVK_OPTIONS_PATTERN }
        });
    }

    return matched[1];
}

const parseCounterId = (html: string) => {
    const matched = html.match(MVK_COUNTER_URL_PATTERN);

    if (!matched) {
        throw new ParseException({
            message: "Unable to get counter id",
            payload: { html, pattern: MVK_COUNTER_URL_PATTERN }
        });
    }

    return matched[1];
}

const requestVKDecorator = (config: IVKConnectionConfig) => {
    const fetch = fetchCookieFollowRedirectsDecorator(config.jar);
    const timeout = 10_000;

    return (url: RequestInfo, options: RequestInit = {}) => {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), timeout);
        return fetch(url, {
            ...options,

            compress: false,
            signal: controller.signal,
            agent: config.proxy?.getAgent(),

            headers: {
                "user-agent": randomMobileUserAgent().userAgent,
                ...options.headers
            }
        }).finally(() => clearTimeout(timerId));
    }
}

export const fetchBrowserData = async (config: IVKConnectionConfig) => {
    const fetch = requestVKDecorator(config);
    const response = await fetch(`https://m.vk.com/${getRandomElement(MVK_PAGES)}`);
    const html = await response.text();

    const data = parseBrowserData(html);
    const mailUrl = parseR3MailUrl(html);
    const counterId = parseCounterId(html);

    return {
        data,
        mailUrl,
        counterId
    }
}

export const fetchAdditionalVKCookie = (
    jar: CookieJarExtension,
    agent: IAgentData
) => {
    try {
        const oneYear = (60_000 * 60) * 24 * 365;
        const nextYear = new Date(Date.now() + oneYear);

        return Promise.all([
            appendCookie(
                jar, createVKCookie("tmr_lvid", {
                    value: getRandomString(32),
                    expires: nextYear
                })
            ),
            appendCookie(
                jar, createVKCookie("tmr_lvidTS", {
                    value: Date.now().toString(),
                    expires: nextYear
                })
            ),
            appendCookie(
                jar, createVKCookie("remixmdevice", {
                    value: [agent.screenWidth, agent.screenHeight, 1, "!!-!!!!"].join("/"),
                    expires: new Date((new Date).getTime() + 7776e6),

                    secure: true
                })
            ),
            appendCookie(
                jar, createVKCookie("tmr_reqNum", {
                    value: 0..toString(),
                    expires: nextYear,

                    secure: false
                })
            ),
            appendCookie(
                jar, createVKCookie("remixlang", {
                    value: '1',
                    expires: nextYear,
                })
            )
        ]);
    } catch (error) {
        return false;
    }
}

export const getCurrentUserInfo = async (config: IVKConnectionConfig) => {
    const id = await getUserId(config);
    return getUserById(id);
}

export const getUserId = async (config: IVKConnectionConfig): Promise<number> => {
    const fetch = requestVKDecorator(config);
    const response = await fetch(VK_USER_INFO_URL);
    const data = await response.json();
    return data.user?.id || -1;
}

export const getUserById = async (id: number) => {
    if (id <= 0) return;
    const url = new URL("/foaf.php?id=" + id, VK_BASE_URL);
    const response = await fetch(url, { method: "GET" });
    const xml = await response.text();
    const result = await parser.parse(xml, {
        allowBooleanAttributes: true,
        trimValues: true,
        parseNodeValue: false
    });

    const person = result['rdf:RDF']['foaf:Person'];

    if (!person) return;

    const user: IUserInfo = {
        publicAccess: person['ya:publicAccess'],
        profileState: person['ya:profileState'],
        firstName: person['ya:firstName'],
        lastName: person['ya:secondName'],
        fullName: person['foaf:name'],
        id: Number(id)
    }

    user.access = user.publicAccess == "allowed";
    return user;
}

// export const isValidVKSession = async (config: IVKConnectionConfig) => {
//     try {
//         const fetch = await createSessionFetch(config);
//         const url = new URL("/feed", VK_MOBILE_BASE_URL);
//         const { config: fetchConfig } = await fetch.get(url.toString());
//         const responseURL = fetchConfig.url;
//         const feedFinded = responseURL?.search("feed");
//         return feedFinded && feedFinded > -1 || false;
//     } catch {
//         return false;
//     }
// }


// !!! UNSAFE UNSAFE !!!
// const VKAPI_VERSION = "5.131"
// const VKAPI_DEV_URL = "https://vk.com/dev";
// const VKAPI_EXECUTE_URL = "https://vk.com/dev/execute";
// const VKAPI_EXECUTE_HASH_PATTERN = /Dev\.methodRun\('([^']+)/i;

// const parseVKDevHash = async (fetch: AxiosInstance) => {
//     const { data: page } = await fetch.get(VKAPI_EXECUTE_URL)
//     const matched = page.match(VKAPI_EXECUTE_HASH_PATTERN);
//     if (!matched) throw new ParseException({
//         message: "Unable to get dev hash",
//         payload: page
//     });

//     return matched[1];
// }

// export const executeVKAPI = async (fetch: AxiosInstance, apiCode: string) => {
//     const hash = await parseVKDevHash(fetch);
//     const options = {
//         act: "a_run_method",
//         al: 1, hash,
//         method: "execute",
//         param_code: apiCode,
//         param_v: VKAPI_VERSION
//     }

//     const response = await fetch.post(`${VKAPI_DEV_URL}?act=a_run_method`, stringify(options), {
//         headers: {
//             "content-type": "application/x-www-form-urlencoded",
//             'x-requested-with': 'XMLHttpRequest'
//         }
//     });

//     const [, data] = response.data.payload;
//     const json = JSON.parse(data);
//     return json;
// }