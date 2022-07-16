import { MenuTemplate } from 'telegraf-inline-menu/dist/source';
import { Logger } from '@utils/logger';
import { backButtons, BotContext, createMenuPagination, numberDeclination, sendAutoDeleteMessage, sendTemporaryMessage } from "../extensions";
import { FILENAME_PREFIX } from "../constants";


const PROXY_DECLINATION = ["прокси-адрес", "прокси-адреса", "прокси-адресов"];
const PROXY_PAGINATION_CHUNK = 5;
const proxyMenu = new MenuTemplate<BotContext>(
    async context => {
        const { pagination, state } = context.session;

        if (!state.proxyMenuInited) {
            state.proxyMenuInited = true;
            pagination.current = 1;
        }

        const checkResults = state.proxyCheckResults;
        const proxy = context.parent.request("proxy-get");

        pagination.total = Math.ceil(proxy.length / PROXY_PAGINATION_CHUNK);
        pagination.hide = proxy.length < 1;

        let socksCount = 0;
        let httpCount = 0;

        proxy.forEach(address => {
            if (address.type == "http") httpCount++;
            if (address.type == "socks") socksCount++;
        });

        const startOffset = (pagination.current - 1) * PROXY_PAGINATION_CHUNK;
        const endOffset = startOffset + PROXY_PAGINATION_CHUNK;
        const proxyChunk = proxy.slice(
            startOffset,
            endOffset
        );

        const lines = [
            "<b>Прокси-меню.</b> 🌏\n",
            `Кол-во SOCKS прокси-адресов: <b>${socksCount}</b>`,
            `Кол-во HTTP(-S) прокси-адресов: <b>${httpCount}</b>\n`,

            proxyChunk.map(proxy => {
                const hostname = `${proxy.address}:${proxy.port}`;
                if (!checkResults) return hostname;
                const proxyResult = checkResults.find(result => compareProxy(proxy, result.proxy))
                if (!proxyResult) return hostname;
                const { time } = proxyResult;
                return `${hostname} | ${parseInt(time, 10).toLocaleString("ru")} ms`
            }).join("\n")
        ].join("\n");

        return {
            text: lines,
            parse_mode: "HTML"
        }
    }
);

function compareProxy(a, b) {
    return a.address == b.address
        && a.port == b.port
        && a.auth?.username == b.auth?.username
        && a.auth?.password == b.auth?.password;
}

createMenuPagination(proxyMenu);

proxyMenu.interact("🧪 Проверка прокси", "proxy-check", {
    async do(context) {
        const deleteFirstMessage = await sendTemporaryMessage(context, {
            text: "🙂 *Идет проверка прокси-адресов...*\n\nЭто может занять несколько секунд",
            extra: { parse_mode: "Markdown" }
        });

        const { successCount, invalidCount, proxies } = await context.parent.request("proxy-check");
        context.session.state.proxyCheckResults = proxies;
        await deleteFirstMessage();

        sendAutoDeleteMessage(context, {
            text: `📋 *Проверка прокси-адресов завершена.*\n\nРаботающих: ${successCount}\nНеработающих: ${invalidCount}`,
            delay: 2500,
            extra: { parse_mode: "Markdown" }
        });

        return true;
    }
});

proxyMenu.interact("📲 Скачать", "proxy-download", {
    async do(context: BotContext) {
        await context.answerCbQuery();
        try {
            const proxies = context.parent.request("proxy-get");

            if (!proxies.length) {
                await sendAutoDeleteMessage(context, {
                    text: "😶 Список прокси-адресов пуст.",
                    delay: 2000
                });

                return true;
            }

            const declination = numberDeclination(proxies.length, PROXY_DECLINATION);
            const caption = `🐖 Файл получен.\n📔 Файл содержит ${proxies.length} ${declination}.`;
            const stringify = proxies.map(stringifyProxy).join("\n");
            const buffer = Buffer.from(stringify);

            await context.replyWithDocument({
                source: buffer,
                filename: `${FILENAME_PREFIX}_proxy.txt`
            }, { caption });

            return true;

        } catch (error) {
            Logger.error(error);
            await context.reply("Произошла ошибка при получении файла.\n\nПодробнее: ")
        } finally {
            return false;
        }
    }
});

proxyMenu.interact("➕ Добавить", "proxy-add", {
    async do(context) {
        await context.scene.enter("proxy-load");
        return true;
    },

    joinLastRow: true
});

proxyMenu.manualRow(backButtons);


function stringifyProxy(proxy) {
    const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : "";
    const address = `${proxy.address}:${proxy.port}`;
    return `${proxy.type}://${auth}${address}`;
}

export default proxyMenu;