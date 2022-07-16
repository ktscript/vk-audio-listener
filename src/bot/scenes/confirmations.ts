import { asyncWrapper, sendTemporaryMessage } from "@bot/extensions";
import menu from "@bot/menu";
import { Markup, Scenes } from "telegraf";

const CONFIRM_KEYBOARD = Markup.inlineKeyboard([
    [
        Markup.button.callback("🗑 Удалить", "confirm"),
        Markup.button.callback("Отменить", "cancel")
    ]
]);

export const deleteConfirmation = new Scenes.WizardScene(
    "delete-confirmation",
    asyncWrapper(async context => {
        const { state } = context.wizard;
        const { itemCaption = "данные" } = state;

        state.deleteConfirmation = await sendTemporaryMessage(context, {
            text: `⚠ <b>Вы действительно хотите безвозвратно удалить ${itemCaption}?</b>`,
            extra: {
                parse_mode: "HTML",
                reply_markup: CONFIRM_KEYBOARD.reply_markup
            }
        });
    })
);

deleteConfirmation.action(
    "confirm", asyncWrapper(
        async context => {
            await context.answerCbQuery("deleting...");
            const { state } = context.wizard;
            if (typeof state.confirm == "function") await state.confirm(context);
            await leaveScene(context);
        }
    )
);

deleteConfirmation.action("cancel", asyncWrapper(
    async context => {
        await context.answerCbQuery();
        await leaveScene(context);
    }
));

async function leaveScene(context) {
    const { state } = context.wizard;
    if (typeof state.deleteConfirmation == "function") await state.deleteConfirmation();
    await context.scene.leave();
    await menu.replyToContext(context, state.leaveMenuPath);
}