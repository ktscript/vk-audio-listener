import menu from "../menu";
import { Markup, Scenes } from "telegraf";
import { BACK_BUTTON, BACK_KEYBOARD } from "../constants";
import { asyncWrapper, BotContext, fetchBuffer, getStateReference } from "../extensions";
import { ILAScriptExecuteReason } from "@main/script";
import { InlineKeyboardButton } from "telegraf-inline-menu/dist/source/keyboard";

const reasons: Record<string, ILAScriptExecuteReason> = {
    "При получении Webhook-запроса": 1,
    "При запуске скрипта": 2
}

const addScriptScene = new Scenes.WizardScene<BotContext>("add-script",
    asyncWrapper(async (context) => {
        const state = getStateReference(context);
        state.script = {};

        const buttons: InlineKeyboardButton[] = [];
        for (const name in reasons) {
            const value = reasons[name];
            const button = Markup.button.callback(name, `reason-${value}`);
            buttons.push(button);
        }

        const keyboard = Markup.inlineKeyboard([
            ...buttons,
            BACK_BUTTON
        ], { columns: 1 });

        await context.reply("<b>Выберите триггер</b>\n\nТриггер - это событие, при котором скрипт начнет выполняться:", {
            parse_mode: "HTML",
            reply_markup: keyboard.reply_markup
        });
    }),

    asyncWrapper(async (context) => {
        const state = getStateReference(context);

        if (context.message && "text" in context.message) {
            const name = context.message.text;
            state.script.name = name;

            const info = [
                "Краткая документация",
                "<code>args</code> - массив с внешними аргументами",
                "<code>ila.tasks.add(url, count);</code> - добавляет новое задание в очередь",
                "<code>ila.bot.send(message);</code> - отправить сообщение в боте",
            ].join("\n");

            await context.replyWithHTML(`<b>Укажите JavaScript-файл</b>\n\n${info}`);

            return context.wizard.next();
        }
    }),

    asyncWrapper(async context => {
        try {
            const state = getStateReference(context);
            const status = await uploadJSFile(context);
            if (!status) return;
            await context.parent.request("scripts-add", state.script);
            await finish(context);
        } catch (error: any) {
            await context.reply("Попробуйте ещё раз, произошла ошибка: " + error.message, BACK_KEYBOARD)
        }
    })
);

const MIME_TYPES = ["text/plain", "application/javascript", "text/javascript"];

const uploadJSFile = async (context: BotContext) => {
    const document = context.message && "document" in context.message && context.message.document;
    if (!document) {
        return await context.reply("Некорректный формат файла.\n\nПожалуйста, укажите тектовый документ.", BACK_KEYBOARD);
    }

    const { mime_type, file_id } = document;

    if (!MIME_TYPES.includes(mime_type?.toLowerCase() || "")) {
        await context.reply("Некорректный формат файла.\n\nПожалуйста, укажите тектовый документ.", BACK_KEYBOARD);
        return false;
    }

    const { href } = await context.telegram.getFileLink(file_id);
    const buffer = await fetchBuffer(href);
    const state = getStateReference(context);
    state.script.code = buffer.toString("utf-8");
    return true;
}

addScriptScene.action("back", asyncWrapper(
    async context => {
        await context.answerCbQuery();
        await finish(context);
    }
));

addScriptScene.action(/reason-(\d+)/i, async context => {
    await context.answerCbQuery();
    if (!context.match) return;
    await context.deleteMessage(context.callbackQuery.inline_message_id as any);
    const code = context.match[1];
    context.wizard.state.script.reason = Number(code);
    await context.replyWithHTML("<b>Введите название скрипта</b>");
    context.wizard.next();
})

async function finish(context: BotContext) {
    await menu.replyToContext(context, "/scripts_menu/");
    return context.scene.leave();
}


export default addScriptScene;