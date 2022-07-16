import { backButtons, BotContext } from "@bot/extensions";
import { createBackMainMenuButtons, MenuTemplate } from "telegraf-inline-menu/dist/source";

let controller: IWebhookController;

const webhookMenu = new MenuTemplate<BotContext>(
    async context => {
        if (!controller) {
            controller = webhookController(context);
        }

        const url = await controller.getServerUrl();
        const started = controller.isStarted();
        const statusText = started ? "\n\n🎈 Сервер запущен" : "";

        const text =
            "<b>Webhook 📻</b>\n\n" +
            "Webhook - это инструмент, который позволяет мгновенно оповещать сервер о новом событии со стороннего Web-приложения.\n\n" +
            "⚠️ Некоторые сайты требуют SSL-сертификат для корректной работы. Сгенерируйте SSL-сертификат на сайте ниже.\n" +
            "⚠️ После генерации сертификата установите его кнопкой ниже.\n\n" +
            "🔗 Ссылка для генерации SSL-сертификата: cutt.ly\/bEamKAe\n" +
            `🔗 Ссылка для подключения Webhook: ${url} ${statusText}`;

        return {
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
        }
    }
);

webhookMenu.interact("🧙‍♂️ Запустить", "start", {
    async do(context) {
        controller.start();
        return true;
    },
    async hide(context) {
        return controller.isStarted();
    }
})

webhookMenu.interact(
    async context => {
        const has = controller.hasSSL();
        return has ? "🖊 Изменить SSL-сертификат" : "🧾 Установить SSL-сертификат";
    },
    "ssl-install",
    {
        async do(context) {
            await context.scene.enter("certificate-upload-scene");
            return true;
        },
    }
);

webhookMenu.manualRow(backButtons);

interface IWebhookController {
    isStarted();
    start();
    hasSSL();
    getServerUrl(): Promise<string | undefined>;
}

function webhookController(context: BotContext): IWebhookController {
    return {
        isStarted() {
            return context.parent.request("server-started");
        },

        start() {
            return context.parent.request("server-run");
        },

        hasSSL() {
            return context.parent.request("server-has-certificate")
        },

        getServerUrl() {
            return context.parent.request("server-get-url");
        }
    }
}

export default webhookMenu;