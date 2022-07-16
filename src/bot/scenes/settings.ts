import menu from "@bot/menu";
import { Markup, Scenes } from "telegraf";
import { BACK_BUTTON, BACK_KEYBOARD, PROXY_FORMATS } from "@bot/constants";
import { asyncWrapper, BotContext, getTextMessage } from "@bot/extensions";
export const editAntiCaptcha = new Scenes.WizardScene<BotContext>(
    "edit-anticaptcha",

    asyncWrapper(async (context: BotContext) => {
        const key = context.parent.request("anticaptcha-get");
        const text = key ? `\n\nТекущий ключ: ${key}` : "";
        await context.reply(
            "📟 Введите новый ключ от анти-капчи (anti-captcha.com)" + text,
            BACK_KEYBOARD
        );
        return context.wizard.next();
    }),

    asyncWrapper(async context => {
        const text = await getTextMessage(context);
        if (!text) return await context.reply("Пожалуйста, укажите ключ анти-капчи.", BACK_KEYBOARD);
        const response = await context.parent.request("anticaptcha-set", text.trim());
        if (!response) {
            return await context.reply("Некорректный ключ. Попробуйте ещё раз", BACK_KEYBOARD);
        }

        await context.reply("Ключ установлен.");
        await cancel(context);
    })
);

editAntiCaptcha.action("back", async context => {
    await context.answerCbQuery("Cancelation...");
    await cancel(context);
})

const SELECT_PROXYTYPE_KEYBOARD = Markup.inlineKeyboard([
    [
        Markup.button.callback("SOCKS", "select-socks"),
        Markup.button.callback("HTTP(-S)", "select-http")
    ],
    [BACK_BUTTON]
]);

export const editSystemProxy = new Scenes.WizardScene<BotContext>(
    "edit-system-proxy",
    asyncWrapper(async context => {
        const systemProxy = context.parent.request("proxy-system-get");
        const currentDecorate = systemProxy
            ? `🧂 Текущий прокси-адрес: <i>${systemProxy.address}:${systemProxy.port}</i>`
            : `⚠ Прокси-адрес не установлен.`;


        const formatText = "Выберите тип загружаемого прокси-адреса.";
        await context.replyWithHTML(`<b>Изменение системного прокси-адреса</b>\n\n${currentDecorate}\n${formatText}`, SELECT_PROXYTYPE_KEYBOARD);
    }),

    asyncWrapper(async context => {
        const text = getTextMessage(context);
        if (!text) {
            return await context.reply("🛑 Пожалуйста, укажите системный прокси-адрес.", BACK_KEYBOARD);
        }
        const { type } = context.wizard.state;
        await context.reply("Устанавливаем системный прокси-адрес.\n\nСоединение с сервером...");
        const result = await context.parent.request("proxy-system-set", type, text);

        if (!result)
            return await context.reply(
                "⛔ Не получилось соединиться с сервером через указанный прокси-адрес.\n\n" +
                "Пожалуйста, укажите другой.",
                BACK_KEYBOARD
            );

        await context.reply(
            "😇 Системный прокси-адрес успешно установлен.\n\n" +
            `⌛ Время ответа от mail.ru и vk.com: ${Number(result.time).toLocaleString("ru")} ms`
        );
        await cancel(context);
    })
);

editSystemProxy.action(/select-(\S+)/i, async context => {
    await context.answerCbQuery();
    const type = context.match[1];
    context.wizard.state.type = type;

    await context.reply(
        `Отправьте мне ${type.toUpperCase()} прокси-адрес.\n\n` +
        "Поддерживаемые форматы прокси-адресов:\n" +
        PROXY_FORMATS.map((format, index) => `${index + 1}) ${format}`).join("\n"),
        BACK_KEYBOARD
    );

    context.wizard.next();
})

editSystemProxy.action("back", async context => {
    await context.answerCbQuery();
    await cancel(context);
});

async function cancel(context: BotContext) {
    await context.scene.leave();
    await menu.replyToContext(context, "/settings_menu/");
}