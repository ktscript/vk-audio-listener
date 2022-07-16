import { Markup, Scenes } from "telegraf";
import { parsePlaylistUrl } from "@main/utils/helpers";
import { BACK_KEYBOARD, ERROR_EMOJI } from "../constants";
import { asyncWrapper, BotContext, getStateReference, getTextMessage, playlistDecorator } from "../extensions";
import menu from "../menu";
import { Logger } from "@utils/logger";

const COMPLETE_BUTTON = Markup.button.callback("＋ Создать", "create-task");

const DEFAULT_TASK_SETTINGS = {
    enableHuman: true,
    enableFavoriteAudio: false,
    startTime: null,
    endTime: null
}

const settingsKeyboard = {
    human: ["Отключить живые прослушивания", "Включить живые прослушивания"],
    favorite: ["Отключить добавление в мои аудио", "Включить добавление в мои аудио"]
}

const addNewTaskScene = new Scenes.WizardScene<BotContext>("add-new-task",
    asyncWrapper(async (context) => {
        let state = getStateReference(context);
        state.task = {};

        await context.reply("🔗 Укажите ссылку на плейлист.", BACK_KEYBOARD);
        return context.wizard.next();
    }),

    asyncWrapper(async (context) => {
        let state = getStateReference(context);
        if (context.message && "text" in context.message) {
            let string = context.message.text.trim();
            let result = parsePlaylistUrl(string);
            if (result) {
                await context.reply("Получаем информацию о плейлисте...");
                try {
                    const playlistContent = await context.parent.request("listener-playlist-info", string);
                    state.task.playlist = playlistContent;
                    await context.reply("Информация о плейлисте получена.\n\n" + playlistDecorator(playlistContent), { parse_mode: "Markdown" });
                } catch (error) {
                    Logger.error("Fetching playlist error:", error);
                    return await context.reply("Невозможно получить доступ к указанному плейлисту.\n\nПопробуйте ещё раз");
                }

                state.task.playlistUrl = string;

                await context.reply(
                    "🙂 *Укажите требуемое кол-во прослушиваний.*\n\n" +
                    `🎗 Указанное число, будет прибавлено к фактическому числу прослушиваний на плейлисте (${state.task.playlist.listens}).\n` +
                    "Как только заданное число прослушиваний выполнится, задание будет *удалено*", {
                    reply_markup: BACK_KEYBOARD.reply_markup,
                    parse_mode: "Markdown"
                });

                return context.wizard.next();
            }
        }

        await context.reply(`${ERROR_EMOJI} Некорректная ссылка на плейлист. Отправьте ещё раз.`, BACK_KEYBOARD);
    }),

    asyncWrapper(async (context) => {
        const state = getStateReference(context);
        const text = getTextMessage(context);
        const number = Number(text);

        if (!text || number == NaN || number < 1 || number > 2e9) {
            return await context.replyWithHTML(`${ERROR_EMOJI} <b>Некорректное число.</b> Попробуйте ещё раз.`, BACK_KEYBOARD);
        }

        state.task.totalCount = number;
        state.task.settings = DEFAULT_TASK_SETTINGS;
        await printKeyboard(context);
        context.wizard.next();
    }),

    asyncWrapper(async context => { })
);

addNewTaskScene.action("back", asyncWrapper(
    async context => {
        await context.answerCbQuery();
        await finish(context);
    }
));

addNewTaskScene.action("toggle-human", asyncWrapper(
    async context => {
        await context.answerCbQuery();
        const { state } = context.wizard;
        const { settings } = state.task;
        settings.enableHuman = !settings.enableHuman;
        await editKeyboard(context);
    }
));

addNewTaskScene.action("toggle-favorite", asyncWrapper(
    async context => {
        await context.answerCbQuery();
        const { state } = context.wizard;
        const { settings } = state.task;
        settings.enableFavoriteAudio = !settings.enableFavoriteAudio;
        await editKeyboard(context);
    }
));

addNewTaskScene.action(
    "create-task", asyncWrapper(
        async context => {
            await context.answerCbQuery();
            await add(context);
            await finish(context);
        }
    )
)

async function printKeyboard(context: BotContext) {
    const message = createTaskSettingsMessage(context);
    await context.replyWithHTML(message.text, message.keyboard);
}

async function editKeyboard(context: BotContext) {
    const message = createTaskSettingsMessage(context);
    await context.editMessageReplyMarkup(message.keyboard.reply_markup);
}

function createTaskSettingsMessage(context: BotContext) {
    const text =
        '<b>Настройка задания</b>\n\n' +
        'Живые прослушивания - включите их, если хотите, чтобы прослушивания отображались у вашего аггрегатора.\n' +
        'Добавление в мои аудио - включите опцию, если хотите повысить релевантность ваших трек-листов.';

    const { button } = Markup;
    const { task } = context.wizard.state;

    const humanButton = button.callback(
        settingsKeyboard.human[+task.settings.enableHuman],
        "toggle-human"
    );
    const favoriteButton = button.callback(
        settingsKeyboard.favorite[+task.settings.enableFavoriteAudio],
        "toggle-favorite"
    );

    const keyboard = Markup.inlineKeyboard([
        [humanButton],
        [favoriteButton],
        [COMPLETE_BUTTON]
    ]);

    return { text, keyboard };
}

async function add(context: BotContext) {
    const state = context.wizard.state;
    await context.parent.request("listener-add-task", state.task);
    await context.replyWithMarkdown(`🦁 *Задание успешно добавлено*`);

}
async function finish(context: BotContext) {
    await menu.replyToContext(context, "/listener_menu/");
    return context.scene.leave();
}


export default addNewTaskScene;