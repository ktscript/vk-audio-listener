import { IListenTask } from "@main/types";
import fetch from "node-fetch";
import { Context, Markup, Scenes, session, Telegraf } from "telegraf"
import { createBackMainMenuButtons, MenuTemplate } from "telegraf-inline-menu"
import { ExtraReplyMessage } from "telegraf/typings/telegram-types";
import { BotParentPort } from ".";
import { BACK_BUTTON_TEXT, BACK_KEYBOARD, ERROR_EMOJI, FILE_EMOJI, TEXT_EMOJI } from "./constants";

interface BotWizardSession extends Scenes.WizardSessionData { }

interface BotSession extends Scenes.WizardSession<BotWizardSession> {
    tasks: IListenTask[];
    taskIndex: number;
    pagination: {
        current: number;
        total: number;
        hide: boolean;
    };
    auth: boolean;
    initial?: boolean;
    state: any;
}


export interface BotContext extends Context {
    match: RegExpMatchArray | null;
    // declare session type
    session: BotSession;
    // parent adapter 
    parent: BotParentPort;
    // declare scene type
    scene: Scenes.SceneContextScene<BotContext, BotWizardSession>
    // declare wizard type
    wizard: Scenes.WizardContextWizard<BotContext> & { state: any; }
}

interface IMessageOptions {
    text: string;
    extra?: ExtraReplyMessage;
}

interface IAutoDeleteMessageOptions extends IMessageOptions {
    delay: number;
}

export const sendAutoDeleteMessage = async (context: BotContext, { text: message, delay, extra }: IAutoDeleteMessageOptions) => {
    const { message_id } = await context.reply(message, extra);
    setTimeout(() => context.deleteMessage(message_id).catch(), delay);
}

export const sendTemporaryMessage = async (context: BotContext, options: IMessageOptions) => {
    const { message_id } = await context.reply(options.text, options.extra);
    return () => context.deleteMessage(message_id);
}

export const getStateReference = (context: BotContext) => {
    return context.wizard.state;
}

export const numberDeclination = (int: number, variants: string[]) => {
    let cases = [2, 0, 1, 1, 1, 2];
    return variants[
        (int % 100 > 4 && int % 100 < 20)
            ? 2
            : cases[(int % 10 < 5) ? int % 10 : 5]
    ];
}

export const fetchBuffer = async (url: string): Promise<Buffer> => {
    const response = await fetch(url, { method: "GET" });
    return response.buffer();
}

export const escapeMarkdownSymbols = (text: string) => {
    return text
        .replace("_", "\\_")
        .replace("*", "\\*")
        .replace("[", "\\[")
        .replace("`", "\\`");
}

export const asyncWrapper = (handler: (context: BotContext) => Promise<any>) => {
    return async (context: BotContext) => {
        try {
            await handler(context);
        } catch (error) {
            let markup = BACK_KEYBOARD.reply_markup;
            await context.reply(
                `${ERROR_EMOJI} При выполнении команды произошла ошибка:\n\nПодробнее: *${(error as Error).message}*`,
                { parse_mode: "Markdown", reply_markup: markup }
            )
        }
    }
}

export function sendLoadMethodChoice(context) {
    return context.reply(
        "☺ Выберите способ загрузки:",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(`${FILE_EMOJI} Файл`, "file-format"),
                Markup.button.callback(`${TEXT_EMOJI} Текст`, "text-format")
            ],
            [Markup.button.callback(BACK_BUTTON_TEXT, "back")]
        ])
    );
}

export const advanceSceneStep = (context: BotContext, offset = 0) => {
    return context.wizard.selectStep(context.wizard.cursor + offset + 1);
}

export const backButtons = createBackMainMenuButtons("Назад", "Главное меню");

export const isTextMessage = (context: BotContext) => context.message && "text" in context.message;
export const getTextMessage = (context: BotContext) => isTextMessage(context) && (context.message as { text: string; }).text;
export const escape = (value: string) => value.replace(/<.*>/g, "");
export const formatInt = (value: number) => Number(value).toLocaleString("ru");

export function taskDecorator(task: IListenTask, showHeader = true) {
    const { playlist: playlistContent } = task;

    const bold = (value: any) => `<b>${value}</b>`;

    const playlistUrl = convertPlaylistInfoToUrl(playlistContent);
    const description = playlistContent.description.length > 0 ? `${escape(playlistContent.description).substring(0, 32)}...` : undefined;
    const status = task.enabled ? "выполняется" : "остановлено";
    const header = `📙 Задание <a href="${playlistUrl}">${escape(playlistContent.title)}</a> <i>(${status})</i>`;
    const timeLeft = new Date(task.timeLeft);
    const append: string[] = [];
    if (task.timeLeft > Date.now()) {
        append.push(`⌚ Время выполнения: ${bold(timeLeft.toLocaleString("ru"))}`);
    }

    const playlistLines = [
        `Название: ${bold(escape(playlistContent.title))}`,
        `Описание: ${bold(escape(description || "отсутствует"))}`,
        `Официальный: ${bold(escape(playlistContent.isOfficial ? "да" : "нет"))}`,
        `Аудиозаписей: ${bold(playlistContent.audioList.length)}`,
        `Прослушиваний: ${bold(formatInt(playlistContent.listens))}\n`,
        ...append,
        `🎯 Цель: ${bold(formatInt(task.progress.target))}`,
        `🧩 Осталось: ${bold(formatInt(task.progress.target - playlistContent.listens))}`,
        `🤟 Накручено: ${bold(formatInt(playlistContent.listens - task.progress.initial))}`,
    ].join("\n");

    return showHeader ? `${header}\n\n${playlistLines}` : playlistLines;
}

export function createMenuPagination(menu: MenuTemplate<BotContext>) {
    const LEFT_ARROW = "\u276E";
    const RIGHT_ARROW = "\u276F";
    const hide = ({ session }: BotContext) => session.pagination.hide;
    const update = ({ session }: BotContext) => {
        if (session.pagination.current > session.pagination.total) {
            session.pagination.current = 0;
        }
    }

    menu.interact(LEFT_ARROW, "prev-page", {
        do(context) {
            const { pagination } = context.session;
            if (pagination.current > 1) {
                pagination.current--;
            }

            update(context);
            return true;
        },
        hide
    });

    menu.interact(({ session }) => `${session.pagination.current}/${session.pagination.total}`, "page-num", {
        do(context) {
            update(context);
            return true;
        },
        hide,
        joinLastRow: true
    });

    menu.interact(RIGHT_ARROW, "next-page", {
        do(context) {
            const { pagination } = context.session;
            if (pagination.current < pagination.total) {
                pagination.current++;
            }
            update(context);
            return true;
        },
        hide,
        joinLastRow: true
    });
}

export const playlistDecorator = (playlist) => {
    const playlistParagraphs = [
        `🐶 Название: ${playlist.title}`,
        `📒 Описание: _${escape(playlist.description) || "отсутсвует"}_`,
        `🏢 Официальный: _${playlist.isOfficial ? "да" : "нет"}_`,
        `📼 Плейлист: [ссылка](https://vk.com/music/playlist/${playlist.ownerId}_${playlist.id})`,
        `🔉 Количество аудиозаписей: ${playlist.audioList.length}\n`,
        `🍎 Кол-во прослушиваний: *${formatInt(playlist.listens)}*\n`
    ];

    return playlistParagraphs.join("\n");
}

export function convertPlaylistInfoToUrl(playlistInfo: any) {
    return `vk.com/music/playlist/${playlistInfo.ownerId}_${playlistInfo.id}`;
}

export function formatEnabledTask(value: boolean) {
    return value ? "выполняется" : "приостановлен"
}