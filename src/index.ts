import Bot from "@bot/index";
import { ILAApplication, ilaGlobalConfig } from "@main/index";
import { Logger } from "@utils/logger";
import { ILAEntryPoint } from "./bus";
import { initResourceFolderSync, setConsoleTitle } from "@main/utils";
const logger = new Logger({ module: "main" });
const ila = new ILAApplication();
const bot = new Bot();
const communicate = new ILAEntryPoint(ila, bot);

(async function main() {
    try {
        initResourceFolderSync();
        displayVersion();
        await Logger.init();
        await communicate.run();
    } catch (error: any) {
        logger.error(error.message);
        logger.warn("Exiting in 3 seconds...")
        setTimeout(() => exitHandler(), 3_000);
    }
})();

async function displayVersion() {
    console.clear();
    const currentVersion = await ila.getCurrentVersion();
    if (!currentVersion) return;

    setConsoleTitle(`ila v${currentVersion.version} (${currentVersion.stage})`);
    const versionText = `${currentVersion.version} (${currentVersion.stage})`;
    const texts = [
        "| |     /\\",
        "| |___ /~~\\ v" + versionText,
        "   Dev: @the_usik",
        "      Enjoy!"
    ];
    console.log(texts.map(line => "\t" + line).join("\n"))
    console.log();
}

interface IExitStatus {
    cleanup: boolean;
    exit: boolean;
}

let exiting = false;

async function exitHandler(status?: Partial<IExitStatus>) {
    if (exiting) return;
    exiting = true;

    try {
        await ila.shutdown();
        Logger.terminate();
        process.exit(0);
    } catch (error) {
        logger.error("exit error:", error)
        exiting = false;
    }
}

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

//catches uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error("Uncaught error:", error);
    exitHandler();
});