import { join } from "path";
import { Telegraf, Scenes, TelegramError, Markup } from "telegraf";
import { BotContext, getTextMessage } from "./extensions";
import menuMiddleware from "./menu"
import * as scenes from "./scenes";
import LocalSession from "telegraf-session-local";
import { Logger } from "@utils/logger";
import { existsSync, mkdirSync } from "fs";
import { User } from "telegraf/typings/core/types/typegram";
import { ILANotification } from "@main/types";
import { ILA_BOT_DATA_PATH } from "@utils/constants";
import { BotNotificationHandler } from "./notify_handler";

const BOT_SESSION_FILENAME = "bot_session.json";
const BOT_SESSION_PATH = join(ILA_BOT_DATA_PATH, BOT_SESSION_FILENAME);

const GUEST_SCENE_NAMES = ["auth", "initial"];

const sceneNames = Object.keys(scenes);
const guestStage = new Scenes.Stage<BotContext>(
    sceneNames
        .filter(key => GUEST_SCENE_NAMES.includes(key))
        .map(key => scenes[key])
);
const mainStage = new Scenes.Stage<BotContext>(
    sceneNames
        .filter(key => !GUEST_SCENE_NAMES.includes(key))
        .map(key => scenes[key])
);

const createSessionMiddleware = () => new LocalSession({
    database: BOT_SESSION_PATH,
}).middleware();

export class BotParentPort {
    private queue: Map<string, (...args: any[]) => any>;
    public constructor() { this.queue = new Map(); }
    public subscribe(type: string, callback: (...args: any[]) => any) {
        if (this.queue.has(type)) throw new Error(`Already subscribed on the ${type} type`);
        this.queue.set(type, callback);
        return this;
    }

    public request(type: string, ...args: any[]): any {
        const callback = this.queue.get(type);
        if (!callback || typeof callback != "function") throw new Error(`Not found subscribers for a ${type} type`);
        return callback(...args);
    }
}

const enum BotCommand {
    MENU = "menu",
    SETTINGS = "settings",
    LISTENER = "listener",
    ACCOUNTS = "accounts",
    PROXY = "proxy",
    WEBHOOK = "webhook",
    SCRIPTS = "scripts",
    KEYBOARD = "keyboard"
}

const commands: Record<BotCommand, (...args: any) => any> = {
    [BotCommand.MENU]: context => menuMiddleware.replyToContext(context),
    [BotCommand.KEYBOARD]: context => context.reply("Клавиатура установлена 🔥", Markup.keyboard([
        ['Меню', 'Прослушивания'],
        ['Прокси', 'Аккаунты'],
        ["Webhook", "Скрипты"],
        ['Настройки']
    ]).resize()),
    [BotCommand.WEBHOOK]: context => menuMiddleware.replyToContext(context, "/webhook_menu/"),
    [BotCommand.SETTINGS]: context => menuMiddleware.replyToContext(context, "/settings_menu/"),
    [BotCommand.LISTENER]: context => menuMiddleware.replyToContext(context, "/listener_menu/"),
    [BotCommand.ACCOUNTS]: context => menuMiddleware.replyToContext(context, "/accounts_menu/"),
    [BotCommand.PROXY]: context => menuMiddleware.replyToContext(context, "/proxy_menu/"),
    [BotCommand.SCRIPTS]: context => menuMiddleware.replyToContext(context, "/scripts_menu/"),
}

export default class Bot {
    private token?: string;
    private expectingData?: number;
    private resetSession = false;
    private authorized = false;

    public telegraf!: Telegraf<BotContext>;
    public adapter: BotParentPort;
    public notification: BotNotificationHandler;

    public constructor() {
        this.adapter = new BotParentPort();
        this.notification = new BotNotificationHandler(this);
    }

    public setToken(token: string) {
        this.token = token;
        return this;
    }

    public start = () => this.telegraf.launch();

    public async check() {
        try {
            const { telegram } = new Telegraf(this.token!);
            await telegram.getMe();
            return true;
        } catch (error) {
            return false;
        }
    }

    public init() {
        if (!this.token) throw new Error("Bot token not found");
        this.telegraf = new Telegraf<BotContext>(this.token!);

        if (!existsSync(ILA_BOT_DATA_PATH)) {
            mkdirSync(ILA_BOT_DATA_PATH);
        }

        this.telegraf.use(this.parentAdapterMiddleware());
        this.telegraf.use(createSessionMiddleware());
        this.telegraf.use((context, next) => {
            if (!context.session.pagination) {
                context.session.pagination = {
                    total: 1,
                    current: 1,
                    hide: true
                };
            }

            if (this.resetSession) {
                if (context.session.__scenes) {
                    context.session.__scenes.current = undefined;
                    context.session.__scenes.state = {};
                    context.session.__scenes.cursor = 0;
                }
                context.session.tasks = [];
                context.session.taskIndex = 0;
                context.session.initial = undefined;
                context.session.auth = false;
                context.session.pagination = {
                    total: 1,
                    current: 1,
                    hide: true
                };
                this.resetSession = false;
            }

            if (context.session.state == undefined) {
                context.session.state = {};
            }


            next();
        });
        this.telegraf.use(guestStage.middleware());
        this.telegraf.use(async (context: BotContext, next) => {
            try {
                if (context.from?.is_bot) return;
                if (context.session?.auth) {
                    if (!this.authorized) {
                        this.adapter.request("bot-auth-success", context.from!);
                        this.authorized = true;
                    }

                    return next();
                }

                if (this.expectingData) {
                    const text = getTextMessage(context);
                    if (!text) return;
                    if (text != String(this.expectingData)) {
                        const user = context.from!;
                        Logger.warn(`Suspicious activity from user ${user.first_name} ${user.last_name}`);
                        return;
                    }

                    context.session.initial = true;
                    await context.scene.enter("initial");
                    this.expectingData = undefined;
                    return;
                }

                if (context.session.initial) {
                    return next();
                }

                if (this.authorized) return;
                await context.scene.enter("auth");
            } catch (error) {
                Logger.error("bot main middleware error:", error);
            }
        });

        this.telegraf.use(mainStage.middleware());
        this.telegraf.use(menuMiddleware.middleware());

        // Init commands 
        this.telegraf.start(commands.menu);
        this.telegraf.command("keyboard", commands.keyboard);
        this.telegraf.command("settings", commands.settings);
        this.telegraf.command("listener", commands.listener);
        this.telegraf.command("accounts", commands.accounts);
        this.telegraf.command("webhook", commands.webhook);
        this.telegraf.command("scripts", commands.scripts);
        this.telegraf.command("proxy", commands.proxy);

        // Init text commands 
        this.telegraf.hears("Меню", commands.menu);
        this.telegraf.hears("Прослушивания", commands.listener);
        this.telegraf.hears("Прокси", commands.proxy);
        this.telegraf.hears("Аккаунты", commands.accounts);
        this.telegraf.hears("Webhook", commands.webhook);
        this.telegraf.hears("Скрипты", commands.scripts);
        this.telegraf.hears("Настройки", commands.settings);
        this.telegraf.catch(this.createErrorHandler());

        this.telegraf.action("back", async context => {
            try {
                await context.answerCbQuery();
                const { message } = context.callbackQuery;
                if (message) {
                    await context.deleteMessage(message.message_id);
                }

                await commands.menu(context);
            } catch (error) { }
        });

        this.telegraf.action("add-accounts", async context => {
            await context.answerCbQuery();
            await context.scene.enter("accounts-add")
        });

        this.telegraf.action("add-proxy", async context => {
            await context.answerCbQuery();
            await context.scene.enter("proxy-load")
        });
        this.telegraf.action("add-task", async context => {
            await context.answerCbQuery();
            await context.scene.enter("add-new-task")
        });
        this.telegraf.action("edit-anticaptcha-key", async context => {
            await context.answerCbQuery();
            await context.scene.enter("edit-anticaptcha")
        });
    }

    public expect(data: any) {
        this.expectingData = data;
        this.resetSession = true;

        return this;
    }

    public async notify(user: User, notification: ILANotification) {
        return this.notification.notify(user, notification);
    }

    private parentAdapterMiddleware() {
        return (context: BotContext, next) => {
            if (!context.parent) context.parent = this.adapter;
            next();
        }
    }

    private createErrorHandler = () => (error, context) => {
        Logger.error("bot error:", error);
        if (error instanceof TelegramError) return;
        context.reply("😩 Произошла ошибка\n\nПодробнее:" + JSON.stringify(error, null, "\t"));
        this.adapter.request("error", error);
    };
};