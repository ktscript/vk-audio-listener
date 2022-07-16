import { MenuMiddleware, MenuTemplate } from 'telegraf-inline-menu';
import { BotContext } from "../extensions";
import accountsMenu from "./accounts";
import proxyMenu from "./proxy";
import settingsMenu from "./settings";
import listensControlMenu from './listener';
import webhookMenu from './webhook';
import scriptsMenu from './scripts';

const commands = [
    "/start - главное меню",
    "/keyboard - установить клавиатуру",
    "/settings - настройки",
    "/listener - меню прослушивания",
    "/accounts - управление аккаунтами",
    "/proxy - управление прокси-адресами",
    "/webhook - управление веб-сервером",
    "/scripts - управление скриптами"
];

const mainMenuBodyText =
    "<b>Вы попали в главное меню бота</b> 🥰\n\n" +
    "<b>Команды</b>\n" +
    commands.join("\n");

const menu = new MenuTemplate<BotContext>(
    _ => {
        return {
            text: mainMenuBodyText,
            parse_mode: "HTML"
        };
    }
);

menu.submenu("⚡️ Прослушивания", "listener_menu", listensControlMenu);
menu.submenu("🌏 Прокси", "proxy_menu", proxyMenu);
menu.submenu("📒 Аккаунты", "accounts_menu", accountsMenu, { joinLastRow: true });
menu.submenu("🕸 Webhook", "webhook_menu", webhookMenu);
menu.submenu("🧾 Скрипты", "scripts_menu", scriptsMenu, { joinLastRow: true });
menu.submenu("⚙️ Настройки", "settings_menu", settingsMenu);

export default new MenuMiddleware("/", menu);