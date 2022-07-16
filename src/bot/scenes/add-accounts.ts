import { BACK_KEYBOARD } from "@bot/constants";
import { Logger } from "@utils/logger";
import { Scenes } from "telegraf";
import {
    asyncWrapper, BotContext,
    fetchBuffer, getTextMessage
} from "../extensions";
import menu from "../menu";

const scene = new Scenes.WizardScene<BotContext>(
    "accounts-add",
    asyncWrapper(async context => {
        await context.reply("Укажите файл или сообщение, содержащее список аккаунтов.\n\nФормат файла должен соответствовать - login:password", BACK_KEYBOARD);
        return context.wizard.next();
    }),

    asyncWrapper(async context => {
        if (!context.message) {
            return context.reply("Пожалуйста, укажите файл или отправьте сообщение содержащее список аккаунтов.", BACK_KEYBOARD);
        }

        let success = false;
        if ("document" in context.message) {
            try { await uploadAccountsFile(context); } catch (error) {
                Logger.error("bot upload accounts document error", error);
                return await context.reply("При загрузке аккаунтов произошла ошибка\n\nПодробнее в консоли.", BACK_KEYBOARD);
            }

            success = true;
        }

        if ("text" in context.message) {
            try { await uploadAccountsText(context); } catch (error) {
                Logger.error("bot upload accounts text error", error);
                return await context.reply("При загрузке аккаунтов произошла ошибка\n\nПодробнее в консоли.", BACK_KEYBOARD);
            }

            success = true;
        }

        if (success) return await leaveAccountsScene(context);

        await context.reply("Пожалуйста укажите файл или сообщение с аккаунтами.", BACK_KEYBOARD);
    })
);

scene.action("back", asyncWrapper(
    async context => {
        await context.answerCbQuery();
        await leaveAccountsScene(context);
    })
);

async function leaveAccountsScene(context) {
    await menu.replyToContext(context, "/accounts_menu/");
    await context.scene.leave();
}

const uploadAccountsFile = async (context: BotContext) => {
    const document = context.message && "document" in context.message && context.message.document;
    if (!document) return;

    const { mime_type, file_id } = document;

    if (mime_type != "text/plain") {
        return await context.reply("Некорректный формат файла.\n\nПожалуйста, укажите тектовый документ.", BACK_KEYBOARD);
    }

    const { href } = await context.telegram.getFileLink(file_id);
    const buffer = await fetchBuffer(href);

    const response = await context.parent.request("accounts-add", buffer.toString("utf-8"));
    await handleAddAccountsResponse(context, response);
}

const uploadAccountsText = async (context: BotContext) => {
    const text = getTextMessage(context);
    if (!text) return;

    await context.reply("Идет загрузка аккаунтов...");
    const response = await context.parent.request("accounts-add", text.trim());
    await handleAddAccountsResponse(context, response);
}

async function handleAddAccountsResponse(context, response: { total: number; added: number; }) {
    const { total, added } = response;
    if (added == 0) {
        return await context.reply(`Ни один из аккаунтов (${total}) не загружен.`, BACK_KEYBOARD)
    }

    await context.reply(`Аккаунты успешно загружены: ${added}/${total}`, BACK_KEYBOARD);
}


export default scene;