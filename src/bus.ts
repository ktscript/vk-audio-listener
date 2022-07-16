import { ILADataException } from "@main/exceptions";
import { ILAScriptExecuteError, ILAScriptExecuteReason } from "@main/script";
import { ILANotification, ILANotificationCode } from "@main/types";
import { fetchIPInfo } from "@main/utils";
import { ILAWebhook } from "@main/webhook";
import { randomInteger } from "@utils/helpers";
import { Logger } from "@utils/logger";
import ilaEventBus from "./event_bus";
import { ILAApplication } from "./main";
import ask from "@utils/ask";
import Bot from "./bot";

const logger = new Logger({ module: "ila-bus" });

export class ILAEntryPoint {
    private controller = createBotController(this);

    public constructor(
        public application: ILAApplication,
        public bot: Bot
    ) { }

    public async run() {
        await this.application.init();
        this.initCallbacks();
        this.initController();
        await this.runBot();
        this.initScriptContext();
        this.application.scripts.execute(ILAScriptExecuteReason.WhenApplicationRun);

        return this;
    }

    public async runBot() {
        const { botSettings } = this.application;
        if (!botSettings.token) {
            botSettings.token = await ask("Enter the bot token: ");
        }

        this.bot.setToken(botSettings.token);
        const valid = await this.bot.check();
        if (!valid) {
            botSettings.token = undefined;
            logger.warn("Incorrect bot token, try again");
            return this.runBot();
        }

        this.bot.init();
        await this.bot.start();
        this.application.scripts.setExtraContext({ bot: this.bot });
        logger.log("Bot started!");

        if (!botSettings.password) {
            const code = randomInteger(1000, 9999);
            logger.warn(`Your unique code: ${code}`);
            logger.warn('Please send this code to your bot!');
            this.bot.expect(code);
        }

        if (botSettings.user && botSettings.password) {
            await this.application.start();
        }
    }

    private initScriptContext() {
        const botContext = {
            send: (message: string) => {
                const { telegram } = this.bot.telegraf;
                const { botSettings } = this.application;
                if (!botSettings.user) return;
                return telegram.sendMessage(botSettings.user!.id, message, { parse_mode: "HTML" });
            }
        }

        this.application.scripts.setExtraContext({ bot: botContext });
    }

    private initController() {
        const entries = Object.entries(this.controller)
        for (const [key, func] of entries) {
            this.bot.adapter.subscribe(key, func);
        }

        return this;
    }

    private initCallbacks() {
        const { botSettings, webhook } = this.application;
        const handleDataException = (error) => {
            const isDataException = error instanceof ILADataException;
            if (!isDataException || !botSettings.user) {
                return false;
            }

            this.bot.notify(botSettings.user, new ILANotification(
                ILANotificationCode.DATA_REQUIRED,
                error.flag
            ));

            return true;
        }

        const handleNotification = notification => {
            if (botSettings.user)
                this.bot.notify(botSettings.user, notification);
        }

        ilaEventBus.on("error", (error) => {
            const handledDE = handleDataException(error);
            if (handledDE) return;
            if (error instanceof ILAScriptExecuteError) {
                const notification = new ILANotification(
                    ILANotificationCode.SCRIPT_EXECUTE_ERROR,
                    error
                );
                handleNotification(notification);
            }
        });

        webhook.setCallback(async params => {
            this.application.scripts.execute(
                ILAScriptExecuteReason.WhenReceivedWebhookRequest,
                params
            );
        });

        ilaEventBus.on("notify", handleNotification);
    }
}

function createBotController(context: ILAEntryPoint) {
    const { application } = context;
    return {
        "bot-auth": password => {
            if (!application.botSettings.password) return false;
            return application.botSettings.password.trim() == password.trim();
        },
        "bot-auth-success": async user => {
            application.botSettings.user = user;
            application.start().catch(error => {
                logger.error("starting error:", error);
            })
        },
        "bot-set-password": async password => {
            application.botSettings.password = password;
        },

        // common 
        "error": botError => logger.error("Bot error:", botError),
        "get-settings": () => application.appSettings,
        "get-version": () => "beta",
        "check-updates": () => logger.log("Checking updates"),
        "restart": () => application.restart(),
        "get-ip-info": () => fetchIPInfo(),

        // authorization
        "authorization-status": () => application.vk.isAuthRunning,
        "authorization-start": () => application.vk.startAuth(),
        "authorization-stop": () => application.vk.stopAuth(),

        // listener
        "listener-status": () => application.vk.isListenerRunning,
        "listener-start": () => application.vk.startListener(),
        "listener-stop": () => application.vk.stopListener(),
        "listener-get-history": () => application.vk.cache.tasksHistory,
        "listener-add-task": task => application.vk.tasks.add(task),
        "listener-delete-task": id => application.vk.tasks.delete(id),
        "listener-edit-task": (id, params = {}) => application.vk.tasks.edit(id, params),
        "listener-tasks": () => application.vk.tasks.get(),
        "listener-playlist-info": url => application.vk.getPlaylistByUrl(url),
        "listener-update-task": id => {
            const [task] = application.vk.tasks.get({ id });
            if (!task) throw new Error("Task not found");
            return task;
        },

        // accounts
        "accounts-get": (authorized?: boolean) => {
            const accounts = application.vk.accounts.get({ authorized })
            return accounts.map(account => account.toJSON())
        },
        "accounts-add": (data) => application.vk.accounts.addString(data),
        "accounts-clear": async () => {
            await application.vk.accounts.clearSessions();
            application.vk.accounts.clear();
            await application.save();
        },
        "accounts-validate": async () => {
            try {
                const results = await application.vk.accounts.validate();
                return results.map(result => {
                    return {
                        ...result,
                        account: result.account.toJSON()
                    }
                });
            } catch (error) {
                logger.error("account validation error:", error)
            }
        },

        // proxy
        "proxy-get": () => application.vk.proxy.get(),
        "proxy-check": () => application.vk.proxy.validate(),
        "proxy-add": (type, content) => application.vk.proxy.add(type, content),
        "proxy-system-set": (type, raw) => application.appSettings.setSystemProxy(type, raw),
        "proxy-system-get": () => application.appSettings.getSystemProxy(),

        // anticaptcha
        "anticaptcha-set": async key => {
            try {
                return await application.appSettings.setAnticaptcha(key);
            } catch (error) { return false; }
        },
        "anticaptcha-get": () => application.appSettings.getAnticaptcha(),
        "anticaptcha-balance": async () => {
            try { return await application.appSettings.getAnticaptchaBalance(); } catch {
                return null;
            }
        },

        "server-run": () => application.webhook.start(),
        "server-started": () => application.webhook.started,
        "server-set-port": () => { },
        "server-get-url": async () => {
            const info = await fetchIPInfo({ agent: undefined });
            if (!info) return;
            const ip = info.query;
            const port = application.appSettings.getWebhookPort();
            const path = ILAWebhook.WEBHOOK_ROUTE_PATH;
            return `https://${ip}:${port}${path}`;
        },
        "server-has-certificate": () => application.webhook.hasSSL(),
        "server-certificate-file-upload": async (payload) => {
            const { type, buffer } = payload;
            try {
                await application.storage.certificate.createFile(type, buffer);
                return true;
            } catch (error) {
                return false;
            }
        },

        "scripts-get": () => {
            return application.scripts.getScriptsJSON();
        },
        "scripts-delete": (id) => {
            return application.scripts.delete(id);
        },
        "scripts-add": (script) => {
            if (!script.name || !script.code || !script.reason) throw new Error("Invalid params");

            return application.scripts.add(
                script.name, script.code, script.reason
            );
        }
    }
}
