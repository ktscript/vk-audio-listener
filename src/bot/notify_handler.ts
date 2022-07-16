import { ILADataFlag } from "@main/exceptions/data_exception";
import { ILANotification, ILANotificationCode } from "@main/types";
import { Markup } from "telegraf";
import { Message, User } from "telegraf/typings/core/types/typegram";
import { ExtraReplyMessage } from "telegraf/typings/telegram-types";
import Bot from ".";
import { BACK_KEYBOARD } from "./constants";
import { numberDeclination } from "./extensions";

export class BotNotificationHandler {
    private notifications: Map<ILANotificationCode, Message.TextMessage>;

    public constructor(private bot: Bot) {
        this.notifications = new Map();
    }

    public async notify(user: User, notification: ILANotification) {
        const send = this.createReplyHTMLMessage(user);
        const sendTemporary = (delay): typeof send => async (text, extra) => {
            const message = await send(text, extra);
            setTimeout(() => this.deleteMessage(message), delay);
            return message;
        }

        const { code, payload } = notification;
        switch (code) {
            case ILANotificationCode.NEED_AUTHORIZATION: {
                const declination = numberDeclination(payload.length, [
                    "неавторизированный аккаунт",
                    "неавторизированных аккаунта",
                    "неавторизированных аккаунтов",
                ])

                const message = await send(
                    `⚠ <b>У вас ${payload.length} ${declination}.</b>\n\n` +
                    `Чтобы авторизировать, перейдите в меню аккаунтов: /accounts`
                );

                setTimeout(() => this.deleteMessage(message), 5_000);

                break;
            }

            case ILANotificationCode.ACCOUNTS_VALIDATION_START: {
                const declination = numberDeclination(payload, ["аккаунта", "аккаунтов", "аккаунтов"]);
                const message = await send(
                    `⌛ <b>Идет проверка ${payload} ${declination}...</b>`
                );

                this.notifications.set(
                    ILANotificationCode.ACCOUNTS_VALIDATION_START,
                    message
                );

                break;
            }

            case ILANotificationCode.ACCOUNTS_VALIDATION_STOP: {
                await this.deletePreviousNotify(ILANotificationCode.ACCOUNTS_VALIDATION_START);
                const { total, success, authorized } = payload;
                const text = [
                    "Всего аккаунтов: " + total,
                    "Готовых к работе: " + success,
                    "Неавторизированных: " + (total - authorized)
                ].join('\n');

                const message = await send("<b>Проверка аккаунтов завершена! 😎</b>\n\n" + text);
                setTimeout(() => this.deleteMessage(message), 5_000);

                break;
            }

            case ILANotificationCode.PROXY_VALIDATION_START: {
                const message = await send("⌛ <b>Идет проверка прокси-адресов...</b>");
                this.notifications.set(ILANotificationCode.PROXY_VALIDATION_START, message);

                break;
            }

            case ILANotificationCode.PROXY_VALIDATION_STOP: {
                await this.deletePreviousNotify(ILANotificationCode.PROXY_VALIDATION_START);

                const message = await send(`<b>Проверка прокси-адресов завершена! 😎</b>`)
                setTimeout(() => this.deleteMessage(message), 3_000);

                break;
            }

            case ILANotificationCode.ACCOUNTS_PROXY_VALIDATION_START: {
                const message = await send("⌛ <b>Идет проверка прокси-адресов у аккаунтов...</b>")
                this.notifications.set(
                    ILANotificationCode.ACCOUNTS_PROXY_VALIDATION_START,
                    message
                );

                break;
            }

            case ILANotificationCode.ACCOUNTS_PROXY_VALIDATION_STOP: {
                await this.deletePreviousNotify(ILANotificationCode.ACCOUNTS_PROXY_VALIDATION_START);
                const message = await send(`<b>Проверка прокси-адресов у аккаунтов завершена! 😎</b>`)
                setTimeout(() => this.deleteMessage(message), 5_000);

                break;
            }

            case ILANotificationCode.CONNECTION_CHECK_START: {
                const message = await send(`<b>Проверка соединения...</b>`);
                this.notifications.set(
                    ILANotificationCode.CONNECTION_CHECK_START,
                    message
                );
                break;
            }

            case ILANotificationCode.CONNECTION_CHECK_END: {
                await this.deletePreviousNotify(ILANotificationCode.CONNECTION_CHECK_START);
                break;
            }

            case ILANotificationCode.SCRIPT_EXECUTE_ERROR: {
                if (!notification.payload) return;
                const { script, message } = notification.payload!;
                await sendTemporary(60_000)(`⚠ При выполнени скрипта (<b>${script.name.trim()}</b>) произошла <b>ошибка</b>\nОписание ошибки: <i>${message}</i>`, { parse_mode: "HTML" })
                break;
            }

            case ILANotificationCode.DATA_REQUIRED: {
                this.require(payload, { send, sendTemporary });
                break;
            }


            case ILANotificationCode.AUTHORIZATION_START: {
                const info = [
                    "<b>Авторизация запущена</b> ⏳\n",
                    `Аккаунтов: ${payload.count || "неопределено"}`
                ].join("\n");
                await sendTemporary(10_000)(info, { parse_mode: "HTML" });
                break;
            }

            case ILANotificationCode.AUTHORIZATION_COMPLETE: {
                const info = [
                    "<b>Авторизация завершена</b> 🔥\n",
                    `Аккаунтов: ${payload.count || "неопределено"}`,
                    `Удалено: ${payload.deletedCount}`
                ].join("\n");
                await sendTemporary(10_000)(info, { parse_mode: "HTML" });
                break;
            }

            case ILANotificationCode.AUTHORIZATION_NOT_REQUIRED: {
                await sendTemporary(10_000)("⚠ <b>Авторизация не требуется</b>", { parse_mode: "HTML" });
                break;
            }

            case ILANotificationCode.LISTENER_START: {
                const info = [
                    "<b>Прослушивание началось</b> 😙\n",
                    `Кол-во включенных заданий: ${payload.count || 0}`
                ].join("\n");
                await sendTemporary(10_000)(info, { parse_mode: "HTML" });
                break;
            }

            case ILANotificationCode.LISTENER_STOP: {
                await sendTemporary(5_000)("<b>Прослушивания остановлены</b> 🧨", { parse_mode: "HTML" });
                break;
            }

            case ILANotificationCode.LISTENER_TASK_COMPLETED: {
                const info = [
                    "<b>Задание выполнено!</b> 🔥\n",
                    `Название плейлиста: ${payload.playlist.title}`,
                    `Прослушиваний: ${payload.progress.actual}`
                ].join("\n");

                await sendTemporary(60_000)(info, { parse_mode: "HTML" });
                break;
            }
        }
    }

    private async require(flag: number, { send, sendTemporary }) {
        const ERROR_EMOJI = "⭕️";
        const createKeyboard = (buttonText, buttonAction) => Markup.inlineKeyboard([
            [Markup.button.callback(buttonText, buttonAction)]
        ]);

        if (flag & ILADataFlag.ACCOUNTS) {
            await send(
                "⚠ Чтобы запустить прослушивания или авторизацию, необходимо добавить аккаунты.",
                createKeyboard("➕ Добавить аккаунты", "add-accounts")
            );
        }

        if (flag & ILADataFlag.PROXIES) {
            await send(
                "⚠ Пожалуйста, укажите список прокси-адресов.",
                createKeyboard("➕ Добавить прокси", "add-proxy")
            );
        }

        if (flag & ILADataFlag.ANTICAPTCHA) {
            await send(
                "⚠ Добавьте пожалуйста ключ от анти-капчи.\n\nБез анти-капчи, вы не сможете авторизовать свои аккаунты.",
                createKeyboard("✏ Изменить ключ", "edit-anticaptcha-key")
            );
        }

        if (flag & ILADataFlag.TASKS) {
            await send(
                `${ERROR_EMOJI} <b>Задания на прослушивания отсутствуют</b>\n\n` +
                `Пожалуйста, создайте новое задание`, {
                parse_mode: "HTML",
                reply_markup: createKeyboard("➕ Создать задание", "add-task").reply_markup
            });
        }

        if (flag & ILADataFlag.SYSTEM_PROXY) {
            const info = await this.bot.adapter.request("get-ip-info");
            const hasInfo = info?.status == "success";
            const texts =
                `<b>Регион</b>: <i>${info?.regionName}</i>\n` +
                `<b>Страна</b>: <i>${info?.country}</i>\n` +
                `<b>IP-адрес</b>: <i>${info?.query}</i>\n` +
                `<b>Интернет-провайдер</b>: <i>${info?.isp}</i>`;

            const extraInfo = hasInfo ? `${texts}\n\n` : "";
            await send(
                ERROR_EMOJI + " <b>Невозможно подключится к серверам vk.com, mail.ru.</b>\n\n" +
                extraInfo +
                "Пожалуйста, укажите либо измените системные прокси в настройках: /settings",
                {
                    parse_mode: "HTML",
                    reply_markup: BACK_KEYBOARD.reply_markup
                }
            );
        }
    }

    private async deleteMessage(message: Message.TextMessage) {
        return this.bot.telegraf.telegram.deleteMessage(
            message.chat.id,
            message.message_id
        ).catch((error) => { console.log("error:", error) });
    }

    private async deletePreviousNotify(code: ILANotificationCode) {
        try {
            const previous = this.notifications.get(code);
            if (!previous) return;
            this.notifications.delete(code);
            await this.deleteMessage(previous);
        } catch (error) { }
    }

    private createReplyHTMLMessage(user: User) {
        const { telegram } = this.bot.telegraf;
        return (text: string, extra?: ExtraReplyMessage) => telegram.sendMessage(user.id, text, { ...extra, parse_mode: "HTML" });
    }
}