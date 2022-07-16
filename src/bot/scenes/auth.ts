import { asyncWrapper, BotContext, getTextMessage } from "@bot/extensions";
import menu from "@bot/menu";
import { Scenes } from "telegraf";

export const auth = new Scenes.WizardScene<BotContext>(
    "auth",

    asyncWrapper(async context => {
        await context.reply("Введите пароль:");
        return context.wizard.next();
    }),

    asyncWrapper(async context => {
        const text = getTextMessage(context);
        if (!text) return await context.reply("Пожалуйста, укажите пароль.");
        const ok = await context.parent.request("bot-auth", text);
        if (!ok) return await context.reply("Неправильный пароль. Попробуйте ещё раз");

        await context.reply("Успешная авторизация");
        context.session.auth = true;
        await context.parent.request("bot-auth-success", context.from!);
        await menu.replyToContext(context, "/");
        await context.scene.leave();
    })
);


export const initial = new Scenes.WizardScene<BotContext>(
    "initial",

    asyncWrapper(async context => {
        await context.reply("Укажите пароль для бота.\n\nПароль должен содержать не менее 8-ми символов.");
        return context.wizard.next();
    }),

    asyncWrapper(async context => {
        const text = getTextMessage(context);
        if (!text) return await context.reply("Пожалуйста, укажите пароль для Вашего бота.");
        if (text.length < 8) return await context.reply("Длина пароля должна быть больше 8-ми символов.");

        try {
            await context.parent.request("bot-set-password", text);
        } catch (error) {
            return await context.reply("При установке пароля произошла ошибка.\n\nУкажите пароль ещё раз.");
        }

        await context.reply("Пароль успешно установлен.");

        context.session.auth = true;
        context.session.initial = false;
        context.parent.request("bot-auth-success", context.from!);
        await context.scene.leave();
        await menu.replyToContext(context, "/");
    })
);
