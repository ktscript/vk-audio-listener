import { Markup } from "telegraf";

export const FILENAME_PREFIX = "ila_d6bc4f1";
export const BOT_TOKEN_PATTERN = /(\d+)\:(\S{0,35})$/i;

export const FILE_EMOJI = "📁";
export const TEXT_EMOJI = "📝";
export const ERROR_EMOJI = "🤬";
export const BACK_BUTTON_TEXT = "Назад";
export const BACK_MAIN_MENU_TEXT = "Вернуться в главное меню";

export const BACK_BUTTON = Markup.button.callback(BACK_BUTTON_TEXT, "back");
export const BACK_KEYBOARD = Markup.inlineKeyboard([
    [BACK_BUTTON]
]);

export const PROXY_FORMATS = [
    "host:port",
    "username:password@host:port",
    "host:port:username:password"
];

export const enum LoadMethod {
    FILE, TEXT
}

export enum SceneNames {
    AddListenTask = "addListenTask"
}