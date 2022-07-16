import { ILAProxy } from "@main/net";
import { MenuTemplate } from "telegraf-inline-menu/dist/source";

import { backButtons, BotContext, sendAutoDeleteMessage } from "../extensions"
import anticaptchaMenu from "./anticaptcha";

const settingsMenu = new MenuTemplate<BotContext>(
    async (context) => {
        const settings = context.parent.request("get-settings");
        const decorate = (condition: boolean, pasteValue = false) => {
            const value = pasteValue ? condition : "установлен";
            return condition ? value : "отстутствует";
        }
        const systemProxy = settings.getSystemProxy();
        const proxyDecorator = (systemProxy && Object.keys(systemProxy).length > 0)
            ? ILAProxy.from(systemProxy).toString()
            : "не используется";

        const bodyText =
            "⚙️ Вы попали в настройки скрипта\n\n" +
            `📗 Ключ анти-капчи (anti-captcha.com): *${decorate(settings.getAnticaptcha())}*\n` +
            `📗 Системный прокси-адрес: *${proxyDecorator}*`;

        return {
            text: bodyText,
            parse_mode: "Markdown"
        }
    }
);

settingsMenu.submenu("📟 Анти-капча", "anticaptcha", anticaptchaMenu);

settingsMenu.interact("🎩 Изменить системный прокси", "edit-system-proxy", {
    async do(context) {
        await context.scene.enter("edit-system-proxy");
        return true;
    }
});

settingsMenu.interact("🔄 Проверить обновления", "check-updates", {
    async do(context) {
        await sendAutoDeleteMessage(context, {
            text: "Проверка обновлений...",
            delay: 4000
        });

        const has = await context.parent.request("check-updates");

        if (!has) {
            await sendAutoDeleteMessage(context, {
                text: "Обновления не найдены.\n\nИспользуется последняя версия скрипта.",
                delay: 4000
            });

            return true;
        }

        return true;
    }
});

settingsMenu.manualRow(backButtons);

export default settingsMenu;