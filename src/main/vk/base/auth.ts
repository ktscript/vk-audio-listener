import { URL } from "url";
import { CheerioAPI, load as cheerioLoad } from "cheerio"
import { stringify as queryStringify } from "querystring";
import {
    Captcha,
    CaptchaHandler,
    CaptchaTypes
} from "@main/common/services/captcha";
import { AuthorizationException } from "@main/exceptions";
import { AuthErrorCode } from "@main/exceptions/authorization_exception";
import {
    CookieJarExtension,
    fetchCookieFollowRedirectsDecorator,
    FetchWrapper
} from "@main/net";
import {
    VK_MOBILE_BASE_URL, VK_USER_INFO_URL
} from "@main/utils";
import ILAProxy from "@main/net/proxy";
import { IAgentData, ISessionCookie } from "@main/types";
import { fetchAdditionalVKCookie, getUserId } from "./general";
import { RequestInfo, RequestInit } from "node-fetch";
import AbortController from "abort-controller";

const LOGIN_URI_PATTERN = /<form method="POST".+"(https:\/\/login\.vk\.com\/.+)"/;
const LOGIN_CAPTCHA_PATTERN = /id="captcha".+"(\/captcha\.php\?s=\d+&sid=(\d+))"/;

const enum AuthorizationAction {
    BLOCKED = "act=blocked",
    SECURITY = "act=security",
    AUTH_CHECK = "act=authcheck",
    INVITE_CONFIRM = "act=invite_confirm",
}

const CAPTCHA_IMAGE_SELECTOR = "#captcha";
const ERROR_MESSAGE_SELECTOR = ".service_msg";
const CAPTCHA_SID_SELECTOR = "input[name=\"captcha_sid\"]";

interface LoginData {
    loginURI: string;
    captcha?: Captcha;
}

interface IAuthorizationOptions {
    login: string;
    password: string;
    proxy: ILAProxy;
    agent: IAgentData;
    captchaHandler?: CaptchaHandler;
}

export class VKAuthorization {
    private readonly CONNECTION_TIMEOUT = 10_000;
    private readonly MAX_AUTH_ATTEMPTS = 2;
    private readonly MAX_CAPTCHA_ATTEMPTS = 3;

    private captchaAttempts = 0;
    private authAttempts = 0;

    private fetchFollowRedirect: FetchWrapper;

    public constructor(
        private jar: CookieJarExtension,
        private options: Partial<IAuthorizationOptions>
    ) {
        this.fetchFollowRedirect = fetchCookieFollowRedirectsDecorator(this.jar);
    }

    private fetch(url: RequestInfo, options: RequestInit = {}) {
        const { agent, proxy } = this.options;
        const controller = new AbortController();
        const timerId = setTimeout(
            () => controller.abort(),
            this.CONNECTION_TIMEOUT
        );

        return this.fetchFollowRedirect(url, {
            ...options,
            agent: proxy?.getAgent(),
            signal: controller.signal,
            headers: {
                ...options.headers,
                "user-agent": agent?.userAgent || ""
            }
        }).finally(() => clearTimeout(timerId));
    }

    public getJar() {
        return this.jar;
    }

    public setCaptchaHandler(value: CaptchaHandler) {
        this.options.captchaHandler = value;

        return this;
    }

    public setLogin(value: string) {
        this.options.login = value;

        return this;
    }

    public setPassword(value: string) {
        this.options.password = value;

        return this;
    }

    public setOptions(value: Partial<IAuthorizationOptions>) {
        this.options = {
            ...this.options,
            ...value
        };

        return this;
    }

    public async run(): Promise<ISessionCookie> {
        const { login, password } = this.options;

        if (!login || !password) throw new AuthorizationException({
            message: "The login or password isn't specified!",
            code: AuthErrorCode.Failed
        });

        await this.jar.removeAllCookies();
        const loginData = await this.fetchLoginData();
        const loginResponse = await this.tryToLogin(loginData);

        return loginResponse;
    }

    protected async tryToLogin(loginData: LoginData): Promise<ISessionCookie> {
        const {
            login,
            password,
            captchaHandler
        } = this.options;

        if (this.captchaAttempts >= this.MAX_CAPTCHA_ATTEMPTS) {
            this.captchaAttempts = 0;

            throw new AuthorizationException({
                message: "Exceeded the maximum number of attempts to solve the captcha",
                code: AuthErrorCode.CaptchaRequired
            });
        }

        const captchaData = loginData.captcha?.getImageCaptchaData();

        if (captchaData && !captchaData.captchaKey) {
            if (!captchaHandler) {
                throw new AuthorizationException({
                    message: `Captcha required (${captchaData!.imageSource})`,
                    code: AuthErrorCode.CaptchaRequired
                });
            }

            let captchaSolveResult: Captcha | undefined;

            try {
                captchaSolveResult = await captchaHandler(loginData.captcha!);
            } catch { } finally {
                if (!captchaSolveResult) {
                    this.captchaAttempts++;
                }
            }

            return this.tryToLogin({
                ...loginData,
                captcha: captchaSolveResult
            });
        }

        const formData = {
            email: login,
            pass: password,
            captcha_sid: captchaData?.captchaSid,
            captcha_key: captchaData?.captchaKey
        };

        const response = await this.fetch(loginData.loginURI, {
            method: "POST",
            body: queryStringify(formData),
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        const html = await response.text();
        const userId = await getUserId({
            agent: this.options.agent,
            jar: this.jar,
            proxy: this.options.proxy
        });

        const valid = userId > -1;
        if (!valid) {
            const url = response.url;
            const $ = cheerioLoad(html);

            scanURLAction(url);

            const captcha = parseCaptcha($, html);
            if (captcha) {
                this.captchaAttempts++;
                loginData.captcha = captcha;
                return this.tryToLogin(loginData);
            }

            const formError = parseFormError($);

            if (this.authAttempts > this.MAX_AUTH_ATTEMPTS) {
                throw new AuthorizationException({
                    message: formError || "Exceeded the maximum number of attempts to auth an account",
                    code: AuthErrorCode.Failed,
                    payload: html
                });
            }

            this.authAttempts++;
            return this.tryToLogin(loginData);
        }

        await fetchAdditionalVKCookie(this.jar, this.options.agent!);
        return this.getSessionCookies();
    }

    protected async fetchLoginData() {
        const response = await this.fetch(VK_MOBILE_BASE_URL, { method: "GET" });
        const html = await response.text();
        const parsedContent = this.parseLoginData(html);

        return parsedContent;
    }

    protected parseLoginData(htmlContent: string): LoginData {
        if (!LOGIN_URI_PATTERN.test(htmlContent)) {
            throw new AuthorizationException({
                message: "The login uri is't found!",
                code: AuthErrorCode.Failed,
                payload: htmlContent
            });
        }

        const [, loginURI] = htmlContent.match(LOGIN_URI_PATTERN)!;
        const loginData: LoginData = { loginURI };

        if (LOGIN_CAPTCHA_PATTERN.test(htmlContent)) {
            const [, imagePath, captchaSid] = htmlContent.match(LOGIN_CAPTCHA_PATTERN)!;
            const imageSource = getVKUrl(imagePath);
            const captcha = new Captcha(CaptchaTypes.Image, {
                imageSource, captchaSid
            });

            loginData.captcha = captcha;
        }

        return loginData;
    }

    private getSessionCookies() {
        return this.jar.getSessionCookie();
    }
}

export function scanURLAction(url: string) {
    if (url.includes(AuthorizationAction.INVITE_CONFIRM)) {
        throw new AuthorizationException({
            message: "Invite confirmation required",
            code: AuthErrorCode.InviteConfirmationRequired,
        });
    }

    if (url.includes(AuthorizationAction.AUTH_CHECK)) {
        throw new AuthorizationException({
            message: "Need 2fa",
            code: AuthErrorCode.TwoFactorRequired
        });
    }

    if (url.includes(AuthorizationAction.BLOCKED)) {
        throw new AuthorizationException({
            message: "Page is blocked",
            code: AuthErrorCode.PageBlocked
        });
    }

    if (url.includes(AuthorizationAction.SECURITY)) {
        throw new AuthorizationException({
            message: "We need to confirm your phone number",
            code: AuthErrorCode.SecurityCheckRequired
        });
    }
}

function parseCaptcha($: CheerioAPI, html: string) {
    const $captchaSidElement = $(CAPTCHA_SID_SELECTOR);
    const $captchaImageElement = $(CAPTCHA_IMAGE_SELECTOR);

    if ($captchaImageElement.length != 0) {
        let captchaSid = $captchaSidElement.attr("value");
        let imageSource = $captchaImageElement.attr("src");

        if (!imageSource || !captchaSid)
            throw new AuthorizationException({
                message: "Cannot to get a captcha data",
                code: AuthErrorCode.CaptchaRequired,
                payload: html
            });

        imageSource = getVKUrl(imageSource);
        return new Captcha(
            CaptchaTypes.Image,
            { imageSource, captchaSid }
        );
    }
}

function parseFormError($: CheerioAPI) {
    const $errorMessage = $(ERROR_MESSAGE_SELECTOR);
    if ($errorMessage.length != 0) {
        return $errorMessage.text();
    }
}

function getVKUrl(path: string) {
    return new URL(path, "https://m.vk.com/").toString();
}