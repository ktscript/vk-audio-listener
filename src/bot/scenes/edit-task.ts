import { BACK_BUTTON, BACK_KEYBOARD } from "@bot/constants";
import { asyncWrapper, BotContext, getStateReference } from "@bot/extensions";
import { Logger } from "@utils/logger";
import { Markup, Scenes } from "telegraf";

const CHANGE_TASK_KEYBOARD = Markup.inlineKeyboard([
    [Markup.button.callback("Скорость", "task-speed")],
    [BACK_BUTTON]
]);

const scene = new Scenes.WizardScene(
    "edit-task",
    asyncWrapper(async context => {
        const { task } = getStateReference(context);
        const title = task.playlistContent?.title ?? " ";

        await context.reply(`✏ Изменение задания ${title}🤨\n\nЧто хотите поменять?`, CHANGE_TASK_KEYBOARD);
    }),

    asyncWrapper(async context => {
        if (!context.message || !("text" in context.message)) {
            return sendIncorrectError(context);
        }

        const number = Number(context.message.text.trim());
        // const { sessions } = bus.getCache();
        // const { task } = getStateReference(context) as { task: Task };

        // if (!number) {
        //     return sendIncorrectError(context);
        // } else if (number < 0 || number > sessions.length) {
        //     return sendIncorrectNumber(context);
        // }

        try {
            // await bus.listens.editTask(task.id, { });
            await context.reply("😁 Задание успешно изменило свое ограничение");
        } catch (error) {
            await context.reply("🤬 При установке ограничения произошла ошибка, подробнее в консоли.");
            Logger.error(error);
        }

        await leaveScene(context);
    })
);

scene.action(
    "task-speed", asyncWrapper(async context => {
        await context.answerCbQuery();
        // const { task } = getStateReference(context) as { task: Task };
        // const { sessions } = bus.getCache();

        // await context.reply(
        //     "👽 Укажите максимальное кол-во сессий для задания.\n\n" +
        //     "Вы указываете число, которое служит ограничением в накрутке, " +
        //     "заданное число позволяет сказать скрипту, какое максимальное количество сессий, " +
        //     "будет задействовано для прослушивания, конкретно, этого задания.\n\n" +
        //     `❕ Максимальное допустимое число сессий: ${sessions.length}\n` +
        //     `❕ Чтобы отключить ограничение, напишите 0\n`,
        //     // "❕ Текущее ограничение: " + (task.maxSessionsCount || "не задано"),
        //     BACK_KEYBOARD
        // );

        return context.wizard.next();
    })
);

scene.action(
    "back", asyncWrapper(async context => {
        await context.answerCbQuery();
        await leaveScene(context);
    })
);

function sendIncorrectNumber(context: BotContext) {
    // const { sessions } = bus.getCache();

    // return context.reply(
    //     "🤬 Число не может быть отрицательным!\n\n" +
    //     `❕ Пожалуйста, укажите натуральное число, которое не превышает кол-во сессий: ${sessions.length}.\n` +
    //     `❕ Чтобы отключить ограничение, отправьте 0.`);
}

function sendIncorrectError(context: BotContext) {
    return context.reply("😒 Пожалуйста, укажите максимальное кол-во сессий:", BACK_KEYBOARD);
}

async function leaveScene(context: BotContext) {
    // await menu.replyToContext(context, "/listens_menu/");
    await context.scene.leave();
}


export default scene;