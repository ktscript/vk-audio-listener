import { ISessionCookie } from "@main/types";
import { MAIL_BASE_URL, VK_BASE_URL, VK_LOGIN_URL } from "@main/utils/constants";
import { Cookie, CookieJar, MemoryCookieStore } from "tough-cookie";
import { promisify } from "util";

export class ILACookieStore extends MemoryCookieStore {
    public constructor() {
        super();
        this.synchronous = false;
    }

    public async getCookieValue(domain: string, key: string) {
        const cookie = await this.findCookie(domain, "/", key);
        return cookie?.value;
    }

    public findCookie = promisify(super.findCookie) as (domain: string, path: string, key: string) => Promise<Cookie | null>;
    public findCookies = promisify(super.findCookies) as (domain: string, path: string, allowSpecialUseDomain: boolean) => Promise<Cookie[]>;
    public getAllCookies = promisify(super.getAllCookies) as () => Promise<Cookie[]>;
    public putCookie = promisify(super.putCookie) as (cookie: Cookie) => Promise<void>;
    public removeCookie = promisify(super.removeCookie) as (domain: string, path: string, key: string) => Promise<void>;
    public removeCookies = promisify(super.removeCookies) as (domain: string, path: string) => Promise<void>;
    public updateCookie = promisify(super.updateCookie) as (oldCookie: Cookie, newCookie: Cookie) => Promise<void>;
}

export default class CookieJarExtension extends CookieJar {
    public constructor(public store?: ILACookieStore) {
        super(store);
    }

    public setSessionCookie(session: Partial<ISessionCookie>) {
        let { base, login, mail } = session;
        base ??= [];
        mail ??= [];
        login ??= [];
        return Promise.all([
            this.setSetCookieHeader(base, VK_BASE_URL),
            this.setSetCookieHeader(login, VK_LOGIN_URL),
            this.setSetCookieHeader(mail, MAIL_BASE_URL)
        ]);
    }

    public async getSessionCookie(): Promise<ISessionCookie> {
        const [base, login, mail] = await Promise.all([
            this.getSetCookieStrings(VK_BASE_URL),
            this.getSetCookieStrings(VK_LOGIN_URL),
            this.getSetCookieStrings(MAIL_BASE_URL),
        ]);
        return { base, login, mail };
    }

    private setSetCookieHeader(cookies: string[], url: string) {
        return Promise.all(
            cookies.map(cookie => this.setCookie(cookie, url))
        );
    }
}