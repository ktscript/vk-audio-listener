import { Logger } from '@utils/logger';
import { MenuTemplate } from 'telegraf-inline-menu/dist/source';
import { FILENAME_PREFIX } from '../constants';
import { backButtons, BotContext, createMenuPagination, numberDeclination, sendAutoDeleteMessage, sendTemporaryMessage } from "../extensions";

const ADD_ACCOUNT_TEXT = "➕ Добавить";
const DOWNLOAD_ACCOUNTS_TEXT = "📥 Скачать";

const ACCOUNTS_DECLINATION = ["аккаунт", "аккаунта", "аккаунтов"];
const ACCOUNTS_PAGINATION_CHUNK = 5;

const accountsMenu = new MenuTemplate<BotContext>(
    async context => {
        const { pagination } = context.session;

        const accounts = context.parent.request("accounts-get");
        const status = context.parent.request("authorization-status");
        const unauth = accounts.filter(account => !account.session?.authorized);

        const authCount = (accounts.length - unauth.length);
        const unauthCount = unauth.length;
        const statusDecorate = (status ? "запущена" : "остановлена");

        const accountsCountDecorate = accounts.length
            ? `Кол-во аккаунтов: <b>${accounts.length}</b>`
            : "Список аккаунтов пуст";

        const lines: string[] = [
            "📒 <b>Управление аккаунтами</b>\n",
            accountsCountDecorate
        ];

        if (authCount > 0) lines.push(`Авторизированных аккаунтов: <b>${authCount}</b>`);
        if (unauthCount > 0) lines.push(`Неавторизированных аккаунтов: <b>${unauthCount}</b>`);

        lines.push(`\nАвторизация: <b>${statusDecorate}</b>`);

        pagination.total = Math.ceil(accounts.length / ACCOUNTS_PAGINATION_CHUNK);
        pagination.hide = pagination.total <= 1;

        const startOffset = (pagination.current - 1) * ACCOUNTS_PAGINATION_CHUNK;
        const endOffset = startOffset + ACCOUNTS_PAGINATION_CHUNK;
        const accountsChunk = accounts.slice(startOffset, endOffset);

        const accountsDecorate = accountsChunk.map(account => {
            const hasSession = Boolean(account.session)
                && Object.keys(account.session).length > 0
                && account.session?.user?.fullName != undefined;

            const name = hasSession
                ? account.session.user.fullName
                : account.login;

            const authText = account.session?.authorized ? "(авторизован)" : "";
            const indicator = account.session?.valid ? "✅" : "⛔";

            return `${indicator} | <b>${name}</b> ${authText}`;
        }).join("\n");

        lines.push("", accountsDecorate);

        return {
            text: lines.join("\n"),
            parse_mode: "HTML"
        }
    }
);

createMenuPagination(accountsMenu);

accountsMenu.interact("🧪 Проверить сессии", "check-sessions", {
    async do(context) {
        const deleteFirstMessage = await sendTemporaryMessage(context, {
            text: "🙂 *Идет проверка сессий...*\n\nЭто может занять несколько секунд",
            extra: { parse_mode: "Markdown" }
        });

        const results = await context.parent.request("accounts-validate");
        if (!results) {
            await deleteFirstMessage();
            await sendAutoDeleteMessage(context, {
                text: "⛔ <b>Произошла ошибка при проверке сессий</b>",
                delay: 2500,
                extra: { parse_mode: "HTML" }
            });
            return false;
        }
        const stats = { invalid: 0, valid: 0 };
        for (const { status } of results) {
            if (!status) stats.invalid++;
            if (status) stats.valid++;
        }

        await deleteFirstMessage();
        await sendAutoDeleteMessage(context, {
            text: "🎯 <b>Проверка сессий завершена.</b>\n\n"
                + `Рабочих: ${stats.valid}\n`
                + `Неработающих: ${stats.invalid}`,
            delay: 2500,
            extra: { parse_mode: "HTML" }
        });

        return true;
    }
});

accountsMenu.toggle("Авторизовать", "run-authorization", {
    isSet: context => context.parent.request("authorization-status"),
    async set(context, state) {
        try {
            const event = state
                ? "authorization-start"
                : "authorization-stop";
            context.parent.request(event);
            return true;
        } catch (error) {
            Logger.error(error);
            return false;
        }
    },
    formatState(context, text, state) {
        return state ? "Остановить" : "Авторизовать";
    },
    joinLastRow: true
});

accountsMenu.interact(DOWNLOAD_ACCOUNTS_TEXT, "download-accounts", {
    async do(context) {
        context.answerCbQuery();

        const accounts = context.parent.request("accounts-get");
        if (accounts.length < 1) {
            await sendAutoDeleteMessage(context, {
                text: "😶 Список аккаунтов пуст.",
                delay: 3000
            });

            return false;
        }

        const declination = numberDeclination(accounts.length, ACCOUNTS_DECLINATION);
        const caption = `🐖 Файл получен.\n📔 Файл содержит ${accounts.length} ${declination}.`;
        const stringify = accounts.map(account => `${account.login}:${account.password}`).join("\n");
        const buffer = Buffer.from(stringify);

        await context.replyWithDocument({
            source: buffer,
            filename: `${FILENAME_PREFIX}_accounts.txt`
        }, { caption })

        return true;
    }
})

accountsMenu.interact(ADD_ACCOUNT_TEXT, "add-accounts", {
    async do(context) {
        context.scene.enter("accounts-add");
        return true;
    },

    joinLastRow: true
});

accountsMenu.interact("🗑 Удалить аккаунты", "delete-accounts", {
    async do(context) {
        await context.scene.enter("delete-confirmation", {
            itemCaption: "аккаунты",
            leaveMenuPath: "/accounts_menu/",
            async confirm() {
                await context.parent.request("accounts-clear");
            }
        });
        return true;
    }
})

accountsMenu.manualRow(backButtons);

export default accountsMenu;