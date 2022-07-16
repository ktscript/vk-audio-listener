import { BACK_BUTTON } from "@bot/constants";
import { asyncWrapper, BotContext, fetchBuffer } from "@bot/extensions";
import menu from "@bot/menu";
import { Logger } from "@utils/logger";
import { Markup, Scenes } from "telegraf";

const CERTIFICATE_MIME_TYPES = [
    "application/x-x509-ca-cert",
    "application/x-iwork-keynote-sffkey"
];

const CERTIFICATE_TYPE_NAMES = {
    [CERTIFICATE_MIME_TYPES[0]]: "cert",
    [CERTIFICATE_MIME_TYPES[1]]: "key"
}

const certificateUploadScene = new Scenes.WizardScene<BotContext>(
    "certificate-upload-scene",

    asyncWrapper(async context => {
        await context.reply(
            "<b>Загрузка SSL-сертификата</b>\n\n" +
            "Отправьте мне 2 файла <b>одним</b> сообщением.\n\n" +
            "⚠ Расширение файлов должно быть .cert и .key",
            {
                parse_mode: "HTML",
                reply_markup: Markup.inlineKeyboard([BACK_BUTTON]).reply_markup
            }
        );

        if (!context.session.state) {
            context.session.state = {};
        }

        return context.wizard.next();
    }),

    asyncWrapper(async context => {
        const { state } = context.session;
        if (state.installed_certificates === undefined || !(state.installed_certificates instanceof Set)) {
            state.installed_certificates = new Set<string>();
        }

        if (!context.message) return;
        const hasDocument = "document" in context.message!;
        if (!hasDocument) return;
        const {
            mime_type,
            file_id
        } = context.message.document;
        if (!mime_type) return context.reply("🛑 Некорректный документ.");
        if (!CERTIFICATE_MIME_TYPES.includes(mime_type)) {
            return context.reply(
                "⛔ <b>Указанный формат документа не поддерживается!</b>\n\n" +
                "Поддерживаемые форматы: " + CERTIFICATE_MIME_TYPES.join(", ") + "\n" +
                "Указан формат: " + mime_type,
                { parse_mode: "HTML" }
            );
        }

        const type = CERTIFICATE_TYPE_NAMES[mime_type];
        const certificates = state.installed_certificates as Set<string>;
        const { href } = await context.telegram.getFileLink(file_id);
        const buffer = await fetchBuffer(href);
        const result = await context.parent.request(
            "server-certificate-file-upload",
            { type, buffer }
        );

        if (!result) return context.reply("⚠ Файл не был загружен!\n\nПопробуйте ещё раз!");

        certificates.add(mime_type);
        await context.reply(`<b>Файл успешно загружен! (${certificates.size} / ${CERTIFICATE_MIME_TYPES.length})🎈</b>`, { parse_mode: "HTML" })
        const completed = certificates.size >= CERTIFICATE_MIME_TYPES.length;

        if (completed) {
            context.session.state = {};
            return leave(context);
        }
    })
);

certificateUploadScene.action("back", async context => {
    await context.answerCbQuery();
    await leave(context);
});

async function leave(context: BotContext) {
    await menu.replyToContext(context, "/webhook_menu/");
    await context.scene.leave();
}

export default certificateUploadScene;