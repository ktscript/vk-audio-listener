import { MenuTemplate } from 'telegraf-inline-menu/dist/source';
import { backButtons, BotContext, createMenuPagination, sendAutoDeleteMessage, taskDecorator } from "@bot/extensions";
import { Logger } from '@utils/logger';

const logger = new Logger({ module: "bot-listener" });
const ENTRIES_PER_PAGE = 5;

const historyMenu = new MenuTemplate<BotContext>(
    async (context) => {
        const history = context.parent.request("listener-get-history");

        return {
            text:
                "📓 История заданий\n\n" +
                `📃 Количество заданий: ${history.length}\n\n` +
                history.map(taskDecorator).join("\n\n"),
            parse_mode: "HTML"
        }
    }
);

historyMenu.manualRow(backButtons);

const taskMenu = new MenuTemplate<BotContext>(async (context) => {
    try {
        context.session.taskIndex = Number(context.match![1]) - 1;

        const { tasks, taskIndex } = context.session;
        let currentTask = tasks[taskIndex];

        if (!currentTask) {
            return "Не могу получить информацию о текущем задании.";
        }

        currentTask = await context.parent.request("listener-update-task", currentTask.id);
        const taskBodyDecorate = taskDecorator(currentTask);
        return {
            text: taskBodyDecorate,
            parse_mode: "HTML"
        }
    } catch (error) {
        Logger.error(error);
        return "⚠ Произошла ошибка при получении информации о задании";
    }
});

taskMenu.interact("🗑 Удалить", "delete-task", {
    async do(context: BotContext) {
        try {
            await context.answerCbQuery();

            const selectedTask = getSelectedTask(context);

            if (!selectedTask) {
                await sendAutoDeleteMessage(context, {
                    text: "😥 Не удается получить текущее задание, для удаления",
                    delay: 3000
                });

                return ".."
            }

            await context.parent.request("listener-delete-task", selectedTask.id);
            await sendAutoDeleteMessage(context, {
                text: "😁 Задание удалено.",
                delay: 2000
            });

            return "..";
        } catch (error) {
            await sendAutoDeleteMessage(context, {
                text: "😥 Ошибка при удалении задания.",
                delay: 3000
            });

            return false;
        }
    },
    hide({ session }) {
        return session.taskIndex == undefined || session.taskIndex < 0
    }
});

taskMenu.toggle("", "task-status", {
    isSet(context, path) {
        const task = getSelectedTask(context);
        return task.enabled;
    },

    async set(context, state, path) {
        try {
            const selectedTask = getSelectedTask(context);
            selectedTask.enabled = state;
            context.parent.request("listener-edit-task", selectedTask.id, {
                enabled: selectedTask.enabled
            });
        } catch (error) { }

        return true;
    },

    formatState(context, text, state) {
        return state ? "⏸ Выключить" : "▶ Включить";
    },

    joinLastRow: true
});

taskMenu.interact("🔄 Обновить", "reload", {
    do: () => true,
});

taskMenu.manualRow(backButtons);

function getSelectedTask(context) {
    const { tasks, taskIndex } = context.session;
    let task = tasks[taskIndex];
    try {
        task = context.parent.request("listener-update-task", task.id);
    } catch (error) {
        logger.error("update listener task error:", error);
    }
    return task;
}

const tasksListMenu = new MenuTemplate<BotContext>(
    async context => {
        const { pagination } = context.session;
        const tasks = context.session.tasks = context.parent.request("listener-tasks");
        const hasTasks = tasks.length > 0;
        const caption = hasTasks
            ? `Заданий: ${tasks.length}`
            : "У вас нет заданий";


        pagination.total = Math.ceil(tasks.length / ENTRIES_PER_PAGE);
        pagination.hide = pagination.total <= 1;

        const text =
            "*Управление заданиями* 📘\n\n" +
            caption;

        return {
            text, parse_mode: "Markdown"
        }
    }
);

tasksListMenu.chooseIntoSubmenu("selected-task", ({ session }) => {
    return session.tasks?.map((_, index) => index + 1) || [];
}, taskMenu, {
    maxRows: ENTRIES_PER_PAGE,
    columns: 1,
    getCurrentPage: context => {
        const page = context.session.pagination.current;
        return page;
    },
    async buttonText({ session }, key) {
        const number = Number(key) - 1;
        const selectedTask = session.tasks[number];
        if (!selectedTask) return "ila_task_" + number;
        session.taskIndex = number;
        return `${getStatusEmoji(selectedTask.enabled)} ${selectedTask.playlist.title}`;
    }
});

createMenuPagination(tasksListMenu);

tasksListMenu.interact("➕ Добавить задание", "add-task", {
    async do(context: BotContext) {
        await context.scene.enter("add-new-task");
        return true;
    }
});

tasksListMenu.manualRow(backButtons);

// LISTENER MENU 
const listensControlMenu = new MenuTemplate<BotContext>(
    async (context) => {
        const status = context.parent.request("listener-status");
        const statusDecorator = status ? "запущено" : "остановлено";
        const text =
            "*Управление прослушиваниями* 🤟🏼\n\n" +
            `Статус прослушивания: _${statusDecorator}_`;

        return {
            text, parse_mode: "Markdown"
        }
    }
);

// Enable/disable button
listensControlMenu.toggle("", "toggle_cheat", {
    isSet(context) {
        return context.parent.request("listener-status");
    },

    async set(context, newState) {
        try {
            newState
                ? context.parent.request("listener-start")
                : context.parent.request("listener-stop");

        } catch (error) {
            Logger.error("Toggle status of the listener error:", error);
            await context.reply("⛔ Произошла ошибка: " + (error as Error).message);
        } finally {
            await context.answerCbQuery();
        }

        return true;
    },

    formatState($, _, state) {
        return state ? "⏸ Остановить" : "▶️ Запустить";
    }
});

// Tasks button 
listensControlMenu.submenu("📘 Задания", "tasks-menu", tasksListMenu);

listensControlMenu.submenu("📙 История заданий", "history", historyMenu);

// Back button 
listensControlMenu.manualRow(backButtons);

function getStatusEmoji(value: boolean) {
    return value ? "\ud83c\udf00" : "💤";
}

export default listensControlMenu;

