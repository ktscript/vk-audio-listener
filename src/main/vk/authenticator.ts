import { AntiCaptcha } from "@main/common/services/captcha";
import { Logger } from "@utils/logger";
import { EventEmitter } from "stream";
import ILADataException, { ILADataErrorCode, ILADataFlag } from "@main/exceptions/data_exception";
import { AccountController } from "./controllers";
import VKActivity from ".";

const logger = new Logger({ module: "authenticator" });

export type AuthEventType =
    "complete" | "error" |
    "started" | "stoped";

class AuthEventEmitter extends EventEmitter {
    public on = (event: AuthEventType, fn: (...args: any[]) => void) => super.on(event, fn);
    public emit = (event: AuthEventType, ...args: any[]) => super.emit(event, ...args);
}

export enum AuthenticatorErrorType {
    FAILED,
    DATA_REQUIRED
}

export class AuthenticatorError extends Error {
    constructor(public type: AuthenticatorErrorType, public data?: any, message?: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }

    toString() {
        return `${this.type} -> ${this.message}`
    }
}

export default class VKAuthenticator extends AuthEventEmitter {
    private static readonly CHUNK_SIZE = 4;
    private running = false;

    public constructor(
        private accounts: AccountController<VKActivity>
    ) { super(); }

    public get isRunning() {
        return this.running;
    }

    public start() {
        if (!this.ready) {
            this.check();
            return;
        }
        if (this.running) return;
        this.running = true;
        this.startAuthenticatorLoop()
            .then(() => logger.log("Authenticator loop completed"))
            .catch(error => logger.error("Authenticator error:", error));
    }

    public stop() {
        if (!this.running) return;
        this.running = false;
    }

    private check() {
        let requiredData = 0;

        if (this.accounts.length == 0) {
            requiredData |= ILADataFlag.ACCOUNTS;
        }

        if (!AntiCaptcha.getKey()) {
            requiredData |= ILADataFlag.ANTICAPTCHA;
        }

        throw new ILADataException(
            "Not enough data",
            ILADataErrorCode.NOT_ENOUGH,
            requiredData
        );
    }

    private async startAuthenticatorLoop() {
        this.emit("started", this.accounts);

        let count = 0;

        const chunkSize = VKAuthenticator.CHUNK_SIZE;
        const accounts = this.accounts.get({ authorized: false });

        while (this.running && count <= accounts.length) {
            const chunk = accounts.slice(count, count + chunkSize);
            const promise = chunk.map(
                account => {
                    logger.log("start authorization...");
                    account.setCaptchaHandler(this.captchaHandler);
                    return account.auth();
                }
            );

            try {
                await Promise.all(promise);
                count += chunkSize;
            } catch (error) { logger.error(error) }
        }

        this.emit("complete", this.accounts);
        this.emit("stoped", this.accounts);
        return this.stop();
    }

    private captchaHandler = (payload) => {
        logger.log("captcha found:", payload.data.imageSource);
        return AntiCaptcha.solveCaptcha(payload)
    }

    private get ready() {
        return (
            this.accounts.length > 0
            && AntiCaptcha.getKey()
        );
    }
}

// export const authAccount = async (account: IVKAccount, config: IAuthAccountConfig): Promise<IVKAccount> => {
//     if (!account.session) {
//         account.session = {
//             cookies: { },
//             valid: true
//         }
//     }

//     if (account.session && Object.keys(account.session.cookies).length > 0 && account.session.valid) {
//         return account;
//     }

//     try {
//         logger.log("start the authorization:", account.login);

//         const agent = randomMobileUserAgent();
//         const proxy = new ILAProxy(config.proxy);

//         const authorization = new VKAuthorization({
//             agent, proxy,
//             login: account.login,
//             password: account.password,
//             captchaHandler: config.captchaHandler
//         });
//         const sessionCookies = await authorization.run();

//         account.session.cookies = sessionCookies;
//         account.session.valid = true;
//         account.session.agent = agent;
//         account.session.proxy = proxy.getProxyData();
//         account.session.user = await getCurrentUserInfo({
//             jar: authorization.getJar(),
//             proxy
//         });

//         logger.log("success account authorization:", account.login);

//         return account;
//     } catch (error: any) {
//         if (error instanceof AuthorizationException) {
//             if (error.code == AuthErrorCode.CaptchaRequired) return account;

//             error.account = account;
//             account.session.valid = false;
//             account.session.cookies = { };
//             delete account.session.proxy;
//             delete account.session.agent;

//             logger.error(`failed account (${account.login}:${account.password}) authorization:`, error.message);
//         }

//         return account;
//     }
// }