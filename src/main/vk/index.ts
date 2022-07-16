import { EventEmitter } from "events";
import VKAuthenticator from "./authenticator";
import { ICache, ILANotification, ILANotificationCode, IListenTask, IVKAccountJSON, IVKSettings } from "@main/types";
import { VKAudioListener } from "./listener";
import { ILAProxy, IProxyData } from "@main/net";
import { Logger } from "@utils/logger";
import {
    AccountController,
    CacheController,
    ProxyController,
    TaskController
} from "./controllers";
import { getRandomElement, parsePlaylistUrl } from "@main/utils";
import ILADataException, { ILADataErrorCode, ILADataFlag } from "@main/exceptions/data_exception";
import { VKAccount } from "./base";
import { ILAApplication } from "..";
import ilaEventBus from "../../event_bus";
import { checkConnection } from "@main/net/checker";

type ILAEventType =
    | "notify"
    | "error"
    | "auth-error"
    | "auth-started"
    | "auth-stoped"
    | "auth-completed"
    | "listener-error"
    | "listener-started"
    | "listener-stoped"
    | "listener-task-completed";

class ILAEventEmitter extends EventEmitter {
    public on = (event: ILAEventType, fn: (...args: any[]) => void) => super.on(event, fn);
    public emit = (event: ILAEventType, ...args: any[]) => super.emit(event, ...args);
}

interface IVKActivityConfig {
    accounts: IVKAccountJSON[];
    proxies: IProxyData[];
    settings: IVKSettings;
    cache: ICache;
}

const logger = new Logger({ module: "vk-activity" });

export default class VKActivity {
    private static readonly VALIDATION_DELAY = 120_000;

    private listener: VKAudioListener<VKActivity>;
    private auth: VKAuthenticator;

    private validationRunning = false;

    public accounts: AccountController<VKActivity>;
    public proxy: ProxyController<VKActivity>;
    public tasks: TaskController<VKActivity>;
    public cache: CacheController<VKActivity>;

    public constructor(private parent: ILAApplication, config: IVKActivityConfig) {
        this.accounts = new AccountController(this, config.accounts);
        this.proxy = new ProxyController(this, config.proxies);
        this.cache = new CacheController(this, config.cache);
        this.tasks = new TaskController(this, config.cache.tasks);
        this.listener = new VKAudioListener(
            this.tasks,
            this.accounts
        );
        this.initListener();
        this.auth = new VKAuthenticator(this.accounts);
        this.initAuth();
    }

    private get lastValidationTime() {
        return this.cache.lastDataValidationTime;
    }

    private set lastValidationTime(value: number) {
        this.cache.lastDataValidationTime = value;
    }

    public get isAuthRunning() {
        return this.auth.isRunning;
    }

    public get isListenerRunning() {
        return this.listener.isRunning;
    }

    public async start() {
        logger.log("VK activity starting...");
        await this.validate();
    }

    public async stop() {
        this.listener.stop();
        this.auth.stop();
    }

    public stopAuth() {
        return this.auth.stop();
    }

    public async startAuth() {
        try {
            this.checkAppConnection();
            if (this.isAuthRunning || this.validationRunning) return;
            this.fillAccountsGaps();
            const unauthAccounts = this.accounts.get({ authorized: false });
            if (unauthAccounts.length < 1) {
                ilaEventBus.emit("notify", new ILANotification(ILANotificationCode.AUTHORIZATION_NOT_REQUIRED))
                return;
            }
            this.auth.start();
        } catch (error) {
            ilaEventBus.emit("error", error);
        }
    }

    public async startListener() {
        try {
            this.checkAppConnection();
            if (this.isListenerRunning || this.validationRunning) return;
            this.fillAccountsGaps();
            await this.listener.start();
        } catch (error) {
            ilaEventBus.emit("error", error);
        }
    }

    public stopListener() {
        this.listener.stop();
    }

    public getPlaylistByUrl(url: string) {
        const proxy = this.parent.appSettings.getSystemProxy();
        const account = new VKAccount({ proxy: proxy && new ILAProxy(proxy) });
        const playlist = parsePlaylistUrl(url);
        if (!playlist) return false;
        return account.audio.fetchDesktopPlaylist(playlist);
    }

    private checkAppConnection() {
        if (!this.parent.isConnectionEstabilished) throw new ILADataException(
            "System proxy required",
            ILADataErrorCode.FAILED,
            ILADataFlag.SYSTEM_PROXY
        );
    }

    private async validate() {
        if (this.validationRunning) return;
        const currentTime = Date.now();
        if (this.lastValidationTime + VKActivity.VALIDATION_DELAY > currentTime) {
            return;
        }

        this.validationRunning = true;

        try {
            if (this.proxy.length) {
                // proxy validation start notification
                ilaEventBus.emit("notify", new ILANotification(
                    ILANotificationCode.PROXY_VALIDATION_START,
                    this.proxy.length
                ));

                const proxyValidationResults = await this.validateProxies();

                // proxy validation stop notification
                ilaEventBus.emit("notify", new ILANotification(
                    ILANotificationCode.PROXY_VALIDATION_STOP,
                    proxyValidationResults
                ));
            }

            const validProxies = this.proxy.get({ valid: true });
            if (validProxies.length < 1) throw new ILADataException(
                "Not enough proxy servers",
                ILADataErrorCode.NOT_ENOUGH,
                ILADataFlag.PROXIES
            )

            const accounts = this.accounts.get();
            if (accounts.length < 1) throw new ILADataException(
                "Not enough accounts",
                ILADataErrorCode.NOT_ENOUGH,
                ILADataFlag.ACCOUNTS
            );

            ilaEventBus.emit("notify", new ILANotification(ILANotificationCode.ACCOUNTS_PROXY_VALIDATION_START));

            let accountIndex = 0;
            let proxyIndex = Math.floor(Math.random() * validProxies.length);
            let attempts = 0;

            const cachedProxies: Set<string> = new Set();

            while (accountIndex < accounts.length) {
                const account = accounts[accountIndex];
                let accountProxy = account.getProxy();

                if (!accountProxy) {
                    accountProxy = validProxies[proxyIndex++ % validProxies.length];
                    account.setProxy(accountProxy);
                }

                const cached = cachedProxies.has(accountProxy.toString());
                if (cached) {
                    accountIndex++;
                    attempts = 0;
                    continue;
                }

                logger.log("Check proxy %s for the account: %s", accountProxy?.toString(), account.toString());
                const valid = await checkConnection(accountProxy);
                if (!valid) {
                    account.setProxy();
                    if (attempts > 3) throw new ILADataException(
                        "Limit reached",
                        ILADataErrorCode.FAILED,
                        ILADataFlag.PROXIES
                    );

                    attempts++;
                    continue;
                }

                cachedProxies.add(accountProxy.toString());
                accountIndex++;
                attempts = 0;
            }

            ilaEventBus.emit("notify", new ILANotification(ILANotificationCode.ACCOUNTS_PROXY_VALIDATION_STOP));
            ilaEventBus.emit(
                "notify", new ILANotification(
                    ILANotificationCode.ACCOUNTS_VALIDATION_START,
                    accounts.length
                )
            );

            const accountsValidateResult = await this.validateAccounts();

            ilaEventBus.emit(
                "notify", new ILANotification(
                    ILANotificationCode.ACCOUNTS_VALIDATION_STOP,
                    accountsValidateResult
                )
            );

            const unauth = this.accounts.get({ authorized: false });
            if (unauth.length) {
                const notify = new ILANotification(ILANotificationCode.NEED_AUTHORIZATION, unauth.map(a => a.toJSON()));
                ilaEventBus.emit("notify", notify);
            }
        } catch (error) {
            this.validationRunning = false;
            this.lastValidationTime = -1;
            throw error;
        } finally {
            this.validationRunning = false;
            this.lastValidationTime = Date.now();
        }
    }

    private async validateAccounts() {
        const accounts = this.accounts.get();
        logger.log("Accounts total:", accounts.length);
        const results = await this.accounts.validate();
        const validAccounts = this.accounts.get({ authorized: true });
        logger.log("Authorized accounts:", validAccounts.length);

        let success = 0;
        let failure = 0;
        let authorized = 0;

        for (const result of results) {
            const { account, status, error } = result;
            if (!status) failure++;
            else {
                if (account.isAuthorized) authorized++;
                if (account.isValid) success++;
                continue;
            }

            if (error) logger.warn("Account errored:", error);
        }

        logger.log("Accounts success:", success);
        logger.log("Accounts failure:", failure);
        logger.log("Accounts authorized count:", authorized);

        const { invalidCount, deletedCount } = this.accounts.deleteInvalid();

        logger.log("Invalid accounts deleted (%i / %i)", deletedCount, invalidCount);

        return { total: accounts.length, success, authorized };
    }

    private async validateProxies() {
        logger.log("Proxy validation (count: %i)", this.proxy.length);
        const results = await this.proxy.validate();
        const { invalidCount, successCount, proxies } = results;
        if (invalidCount > 0) {
            this.proxy.deleteInvalid();
            logger.log("Invalid proxy deleted (%i)", invalidCount);
        }

        const averageRespondTime = proxies
            .filter(proxy => proxy.status)
            .reduce((acc, current) => acc + current.time, 0) / successCount;

        logger.log("Proxy valid:", successCount);
        logger.log("Proxy failure:", invalidCount);
        if (successCount > 0) logger.log("Average proxy respond time: %i ms", averageRespondTime.toFixed(2))

        return results;
    }

    private initAuth() {
        this.auth
            .on("error", error => ilaEventBus.emit("error", error))
            .on("started", () => ilaEventBus.emit("notify", new ILANotification(ILANotificationCode.AUTHORIZATION_START, { count: this.accounts.get({ authorized: false }).length })))
            .on("complete", () => {
                if (this.listener.isRunning) {
                    this.listener.reload();
                }
                const deleteResult = this.accounts.deleteInvalid();
                ilaEventBus.emit("notify", new ILANotification(
                    ILANotificationCode.AUTHORIZATION_COMPLETE, {
                    count: this.accounts.get({ authorized: true }).length,
                    ...deleteResult
                }));
            });
    }

    private initListener() {
        this.listener
            .on("error", error => ilaEventBus.emit("error", error))
            .on("started", () => ilaEventBus.emit("notify", new ILANotification(ILANotificationCode.LISTENER_START, { count: this.tasks.get({ enabled: true }).length })))
            .on("stoped", () => ilaEventBus.emit("notify", new ILANotification(ILANotificationCode.LISTENER_STOP)))
            .on("account-refused", () => {
                this.auth.start();
            })
            .on("task-completed", (task: IListenTask) => {
                ilaEventBus.emit("notify", new ILANotification(ILANotificationCode.LISTENER_TASK_COMPLETED, task));
                this.cache.addTaskHistory(task);
                logger.log("Task \"%s\" completed.", task.playlist.title);
            });
    }

    private fillAccountsGaps() {
        const accounts = this.accounts.get();
        const proxy = this.proxy.get({ valid: true });
        if (proxy.length < 1) {
            throw new ILADataException("Not enough", ILADataErrorCode.NOT_ENOUGH, ILADataFlag.PROXIES);
        }

        for (const account of accounts) {
            const accountProxy = account.getProxy()
            if (accountProxy) continue;

            const currentProxy = getRandomElement(proxy);
            account.setProxy(currentProxy);
        }
    }
}