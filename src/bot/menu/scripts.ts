import { backButtons, BotContext, createMenuPagination, sendAutoDeleteMessage } from "@bot/extensions";
import { ILA_SCRIPT_EXECUTE_REASON_STRINGS } from "@main/script";
import { MenuTemplate } from "telegraf-inline-menu/dist/source";

const SCRIPTS_PAGINATION_CHUNK = 5;
const scriptsMenu = new MenuTemplate<BotContext>(
    async context => {
        const { pagination, state } = context.session;
        const scripts = context.parent.request("scripts-get");
        state.scripts = scripts;

        pagination.total = Math.ceil(scripts.length / SCRIPTS_PAGINATION_CHUNK);
        pagination.hide = scripts.length < 1;

        const lines = [
            "<b>Скрипты</b> 🧾\n",
            `Кол-во скриптов: <b>${scripts.length}</b>`
        ].join("\n");

        return {
            text: lines,
            parse_mode: "HTML"
        }
    }
);

const scriptMenu = new MenuTemplate<BotContext>(
    async context => {
        const errorMessage: any = {
            text: "<b>⛔ Невозможно загрузить информацию о скрипте</b>",
            parse_mode: "HTML"
        }

        if (!context.match) return errorMessage;
        if (!context.match[1]) return errorMessage;

        const index = Number(context.match[1]) - 1;
        const { state } = context.session;
        const script = state.scripts[index];

        state.script = script;

        if (!script) return errorMessage;
        const info = [
            `👨‍💻 <b>Скрипт: ${script.name}</b>\n`,
            `🧪 Срабатывает: <b>${ILA_SCRIPT_EXECUTE_REASON_STRINGS[script.reason]}</b>`
        ].join("\n");

        return {
            text: info,
            parse_mode: "HTML"
        }
    }
);

scriptMenu.interact("🗑 Удалить", "delete", {
    async do(context) {
        const { script } = context.session.state;
        await context.scene.enter("delete-confirmation", {
            itemCaption: "скрипт",
            leaveMenuPath: "/scripts_menu/",
            async confirm() {
                try {
                    await context.parent.request(
                        "scripts-delete",
                        script.id
                    );
                } catch (error) {
                    await sendAutoDeleteMessage(context, {
                        text: "⚠ Скрипт не удален. Ошибка при удалении",
                        delay: 2500
                    })
                }
            },
        });

        return true;
    }
})

scriptMenu.manualRow(backButtons);

scriptsMenu.chooseIntoSubmenu("select-script", ({ session }) => {
    return session.state.scripts?.map((_, index) => index + 1) || [];
}, scriptMenu, {
    maxRows: SCRIPTS_PAGINATION_CHUNK,
    columns: 1,
    getCurrentPage: context => {
        const page = context.session.pagination.current;
        return page;
    },
    async buttonText({ session }, key) {
        const index = Number(key) - 1;
        return session.state.scripts[index]?.name || "unnamed";
    }
});

createMenuPagination(scriptsMenu);

scriptsMenu.interact("🖊 Добавить скрипт", "add-script", {
    async do(context) {
        try {
            await context.scene.enter("add-script");
        } catch (error) {
            console.log(error)
        }
        return true;
    }
});

scriptsMenu.manualRow(backButtons);

// createMenuPagination(scriptsMenu, {
//     update(context) { }
// });

export default scriptsMenu;