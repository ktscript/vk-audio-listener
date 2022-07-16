import { CaptchaHandler } from "@main/common/services/captcha";
import { AuthorizationException } from "@main/exceptions";
import { AuthErrorCode } from "@main/exceptions/authorization_exception";
import { CookieJarExtension, ILACookieStore, ILAProxy, IProxyData, fetch, fetchCookieFollowRedirectsDecorator, FetchWrapper } from "@main/net";
import { IAgentData, ISessionCookie, IUserInfo, IVKAccountJSON, IVKPureAccount } from "@main/types";
import { randomMobileUserAgent, setConsoleTitle, VK_MOBILE_BASE_URL, VK_USER_INFO_URL } from "@main/utils";
import { Logger } from "@utils/logger";
import AbortController from "abort-controller";
import { RequestInfo, RequestInit, Response } from "node-fetch";
import { VKAudio } from "./audio";
import { scanURLAction as scanAuthorizationURLAction, VKAuthorization } from "./auth";
import { fetchBrowserData, getCurrentUserInfo, getUserById } from "./general";

interface IVKAccountConfig {
    login: string;
    password: string;
    user?: IUserInfo;
    proxy?: ILAProxy;
    agent?: IAgentData;
    cookies?: ISessionCookie;
    browserData?: any;
    authorized: boolean;
    captchaHandler?: CaptchaHandler;
}

const logger = new Logger({ module: "account" });

export class VKAccount {
    private store: ILACookieStore;
    private jar: CookieJarExtension;
    private authorization: VKAuthorization;
    private fetchRedirect: FetchWrapper;
    private valid = true;
    private authorized = false;

    public audio: VKAudio;

    public constructor(private config: Partial<IVKAccountConfig> = {}) {
        this.store = new ILACookieStore();
        this.jar = new CookieJarExtension(this.store);

        if (config.cookies && Object.keys(config.cookies).length > 0) {
            this.jar.setSessionCookie(config.cookies);
            this.authorized = true;
        }

        if (!config.agent) {
            config.agent = randomMobileUserAgent();
        }

        this.fetchRedirect = fetchCookieFollowRedirectsDecorator(this.jar);
        this.authorized = config.authorized || false;
        this.authorization = new VKAuthorization(this.jar, config);
        this.audio = new VKAudio(this.jar, config);
    }

    public get isValid() {
        return this.valid;
    }

    public get isAuthorized() {
        return this.authorized;
    }

    public get login() {
        return this.config.login;
    }

    public get password() {
        return this.config.password;
    }

    public get pure(): IVKPureAccount {
        return {
            login: this.config.login!,
            password: this.config.password!
        }
    }

    public setAgent(agent?: IAgentData) {
        this.config.agent = agent;
    }

    public getAgent(): IAgentData | undefined {
        return this.config.agent;
    }

    public setProxy(proxy?: ILAProxy) {
        this.config.proxy = proxy;
    }

    public getProxy() {
        return this.config.proxy;
    }

    public setCaptchaHandler(handler: CaptchaHandler) {
        this.config.captchaHandler = handler;
    }

    public async clear() {
        await this.jar.removeAllCookies();
        this.config.cookies = undefined;
        this.authorized = false;
    }

    public async check() {
        try {
            const response = await this.fetch("https://vk.com/feed", { method: "GET" });
            const user = await this.getCurrentUser();
            if (!user || user?.id === -1) {
                scanAuthorizationURLAction(response.url);

                throw new AuthorizationException({
                    code: AuthErrorCode.Failed,
                    message: "Unauthorized account",
                    payload: response.url
                });
            }

            this.config.user = user;
            this.authorized = true;

            return true;
        } catch (error: any) {
            if (error instanceof AuthorizationException) {
                await this.jar.removeAllCookies();

                if (error.code == AuthErrorCode.Failed) {
                    this.authorized = false;
                    return false;
                }

                this.valid = false;
                this.authorized = false;
            }

            return false;
        }
    }

    public async auth() {
        const { login, password } = this.config;
        if (!login || !password) throw new Error("Incorrect login or password");
        try {
            const session = await this.authorization.run();
            const user = await this.getCurrentUser();
            if (user?.id === -1 || user === undefined) {
                this.authorized = false;
                return;
            }

            this.config.browserData = await this.getBrowserData();
            this.config.user = user;
            this.config.cookies = session;
            this.authorized = true;
            this.valid = true;

            logger.log("success account %s authorization", this.toString());
            return session;
        } catch (error: any) {
            if (error instanceof AuthorizationException) {
                if (error.code === AuthErrorCode.CaptchaRequired) return;

                this.valid = false;
                this.authorized = false;

                error.account = this.toJSON();
                logger.log(`failed account (${this.login}:${this.password}) authorization:`, error.message);
                await this.clear();
                return;
            }

            logger.error("auth():", error);
        }
    }

    public toJSON(): IVKAccountJSON {
        const {
            login, password,
            user, cookies,
            agent, proxy
        } = this.config;

        if (!login || !password) throw new Error("Unable to get json from a pure account");

        return {
            login,
            password,
            session: {
                authorized: this.authorized,
                valid: this.valid,
                cookies,
                agent,
                proxy: proxy?.toJSON(),
                user
            }
        }
    }

    public toString() {
        return this.config.user?.fullName || this.pure.login;
    }

    private async getBrowserData() {
        try {
            if (this.config.browserData) {
                return this.config.browserData;
            }

            return this.config.browserData = await fetchBrowserData(
                this.getVKConnectionOptions()
            );
        } catch (error) { logger.warn("unable to get browser data", error); }
    }

    private async getCurrentUser() {
        return getCurrentUserInfo(this.getVKConnectionOptions())
    }

    private getVKConnectionOptions() {
        return {
            agent: this.getAgent(),
            jar: this.jar,
            proxy: this.getProxy()
        }
    }

    private async fetch(url: RequestInfo, options: RequestInit = {}): Promise<Response> {
        const { agent, proxy } = this.config;
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), 5_000);
        return this.fetchRedirect(url, {
            ...options,
            agent: proxy?.getAgent(),
            signal: controller.signal,
            compress: false,
            headers: {
                origin: "https://m.vk.com",
                referer: "https://m.vk.com/feed",
                "user-agent": agent?.userAgent || "",
                ...options.headers
            }
        }).finally(() => clearTimeout(timerId));
    }

    public static createFromJSON(data: IVKAccountJSON) {
        const session: any = data.session || {};
        if (session?.proxy) session.proxy = new ILAProxy(session.proxy);

        return new VKAccount({
            login: data.login,
            password: data.password,
            ...session
        });
    }
}