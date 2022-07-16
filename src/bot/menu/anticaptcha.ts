import { backButtons, BotContext } from "@bot/extensions";
import { Logger } from "@utils/logger";
import { MenuTemplate } from "telegraf-inline-menu/dist/source";

const anticaptchaMenu = new MenuTemplate<BotContext>(
    async context => {
        try {
            const key = context.parent.request("anticaptcha-get");
            const balance = await context.parent.request("anticaptcha-balance");

            const bodyText =
                "Добро пожаловать в меню управления Анти-Капчи.\n\n" +
                `🔑 Текущий ключ: ${key || "не установлен"}\n` +
                `💵 Баланс аккаунта anti-captcha.com: ${balance + "$" || "недоступно"}`;

            return {
                text: bodyText,
                parse_mode: "Markdown"
            }
        } catch {
            return "При получении информации об анти-капчи, произошла ошибка."
        }
    }
);

anticaptchaMenu.interact("🔑 Изменить ключ", "edit-anticaptcha-key", {
    async do(context) {
        context.scene.enter("edit-anticaptcha");
        return true;
    }
})

anticaptchaMenu.manualRow(backButtons);

export default anticaptchaMenu;