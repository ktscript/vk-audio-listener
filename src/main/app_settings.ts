import { EventEmitter } from "stream";
import { AntiCaptcha } from "./common/services/captcha";
import { ILAProxy, ProxyType, setFetchGlobalAgent } from "./net";
import { checkConnectionResponseTime } from "./net/checker";
import { IAppSettings } from "./types";

export default class ApplicationSettings extends EventEmitter {
    public constructor(private settings: IAppSettings) {
        super();
        const proxy = settings.proxy && ILAProxy.from(settings.proxy);
        const agent = proxy?.getAgent();
        setFetchGlobalAgent(agent);
        if (settings.antiCaptchaKey) {
            AntiCaptcha.setKey(settings.antiCaptchaKey)
        }
    }

    public async setAnticaptcha(key: string) {
        if (this.settings.antiCaptchaKey == key) return true;
        const valid = await AntiCaptcha.isValidKey(key);
        if (!valid) throw new Error("Key is invalid");
        AntiCaptcha.setKey(key);
        this.settings.antiCaptchaKey = key;
        return true;
    }

    public getAnticaptcha = () => this.settings.antiCaptchaKey;
    public getAnticaptchaBalance = () => AntiCaptcha.getBalance();

    public async setSystemProxy(type: ProxyType, proxyString: string) {
        try {
            const proxy = ILAProxy.fromString(type, proxyString);
            const connection = await checkConnectionResponseTime(proxy);
            if (!connection.status) return false;
            const proxyData = proxy.toJSON();
            const proxyAgent = proxy.getAgent();
            this.settings.proxy = proxyData;
            setFetchGlobalAgent(proxyAgent);
            this.emit("system-proxy-connected");
            return connection;
        } catch (error) {
            return false;
        }
    }

    public getSystemProxy() {
        return this.settings.proxy;
    }

    public getWebhookPort() {
        return this.settings.webhookPort;
    }

    public setWebhookPort(port: number) {
        this.settings.webhookPort = port;
        return this;
    }

    public checkSystemProxy() {
        const proxy = this.settings.proxy && ILAProxy.from(this.settings.proxy);
        return checkConnectionResponseTime(proxy);
    }
}