import { Markup, Scenes } from "telegraf";
import menu from "../menu";
import {
    BACK_BUTTON_TEXT, ERROR_EMOJI, PROXY_FORMATS
} from "../constants";
import {
    asyncWrapper, BotContext, fetchBuffer,
    getStateReference
} from "../extensions";
import { Logger } from "@utils/logger";


const BACK_BUTTON = Markup.button.callback(BACK_BUTTON_TEXT, "back");
const BACK_KEYBOARD = Markup.inlineKeyboard([[BACK_BUTTON]]);
const SELECT_PROXY_TYPE_KEYBOARD = Markup.inlineKeyboard([
    [
        Markup.button.callback("HTTP", "set-http"),
        Markup.button.callback("SOCKS", "set-socks"),
    ],
    [BACK_BUTTON]
]);

const proxyLoadScene = new Scenes.WizardScene<BotContext>("proxy-load",
    asyncWrapper(async (context) => {
        await context.reply(
            "Загрузка прокси-адресов.\n\nПожалуйста, выберите тип загружаемых прокси.", SELECT_PROXY_TYPE_KEYBOARD);
    }),

    asyncWrapper(async context => {
        if (!context.message) {
            return context.reply("Пожалуйста, укажите файл или отправьте сообщение содержащее список прокси-адресов.", BACK_KEYBOARD);
        }

        let success = false;

        if ("document" in context.message) {
            try { await fileProcess(context); } catch (error) {
                return await proxyLoadPanic(error, context);
            }

            success = true;
        }

        if ("text" in context.message) {
            try { await textProcess(context); } catch (error) {
                return await proxyLoadPanic(error, context);
            }

            success = true;
        }

        if (success) return await leaveScene(context);

        await context.reply("Пожалуйста укажите файл или сообщение с прокси-адресами.", BACK_KEYBOARD);
    })
);

const fileProcess = async (context: BotContext) => {
    const valid = validProxyType(context);
    if (!valid) return;

    const { type } = context.wizard.state;

    if (!context.message || !("document" in context.message))
        return context.reply(`${ERROR_EMOJI} Отсутствует документ содержащий ${type.toUpperCase()} прокси-адреса.\n\nПопробуйте ещё раз.`, BACK_KEYBOARD);

    const { document } = context.message;

    if (document.mime_type != "text/plain") {
        return context.reply("Некорректный формат файла.\n\nПожалуйста, укажите текстовый документ.", BACK_KEYBOARD);
    }

    const response = await context.telegram.getFileLink(document.file_id);
    const buffer = await fetchBuffer(response.href);
    await context.parent.request("proxy-add", type, buffer.toString("utf-8"));
    await context.reply("Прокси успешно загружены!");
}

const textProcess = async (context: BotContext) => {
    const valid = validProxyType(context);
    if (!valid) return;

    const { type } = getStateReference(context);

    if (!context.message || !("text" in context.message))
        return context.reply(`${ERROR_EMOJI} Вы не отправили список прокси-адресов.\n\nПопробуйте ещё раз.`, BACK_KEYBOARD);

    const buffer = context.message.text.trim();

    await context.parent.request("proxy-add", type, buffer);
    await context.reply("Прокси успешно загружены!");
}

async function leaveScene(context) {
    await menu.replyToContext(context, "/proxy_menu/");

    return context.scene.leave();
}

proxyLoadScene.action(/set-(\S+)/i, async context => {
    await context.answerCbQuery();
    let [, type] = context.match;
    type = type.toLowerCase().trim();
    if (!["http", "socks"].includes(type)) return;

    context.wizard.state.type = type;

    await context.reply(
        `Отправьте мне документ или сообщение, содержащие список ${type.toUpperCase()} прокси-адресов.\n\n` +
        "Поддерживаемые форматы прокси-адресов:\n" +
        PROXY_FORMATS.map((format, index) => `${index + 1}) ${format}`).join("\n"),
        BACK_KEYBOARD
    );

    // select second stage (wait answer of the user) of the current scene
    context.wizard.selectStep(1);
})

proxyLoadScene.action("back", asyncWrapper(
    async context => {
        await context.answerCbQuery();
        await leaveScene(context);
    })
);

async function validProxyType(context: BotContext) {
    const { type } = context.wizard.state;
    if (!type) {
        await context.reply("Вы не выбрали тип прокси-адресов", SELECT_PROXY_TYPE_KEYBOARD);
        return false;
    }

    return true;
}

async function proxyLoadPanic(error, context?: BotContext) {
    Logger.error("bot upload proxies error", error, context?.wizard.state);
    await context?.reply("При загрузке прокси-адресов произошла ошибка\n\nПодробнее в консоли.", BACK_KEYBOARD);
}

export default proxyLoadScene;