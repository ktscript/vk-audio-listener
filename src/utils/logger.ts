import { createWriteStream, WriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import path from "path";
import util from "util"
import { ILA_LOG_DIR_PATH } from "./constants";

export enum SpecialSymbols {
    Reset = "\x1b[0m",
    Bright = "\x1b[1m",
    Dim = "\x1b[2m",
    Underscore = "\x1b[4m",
    Blink = "\x1b[5m",
    Reverse = "\x1b[7m",
    Hidden = "\x1b[8m",
}

export enum ForegroundColors {
    FgBlack = "\x1b[30m",
    FgRed = "\x1b[31m",
    FgGreen = "\x1b[32m",
    FgYellow = "\x1b[33m",
    FgBlue = "\x1b[34m",
    FgMagenta = "\x1b[35m",
    FgCyan = "\x1b[36m",
    FgWhite = "\x1b[37m"
}

export enum BackgroundColors {
    BgBlack = "\x1b[40m",
    BgRed = "\x1b[41m",
    BgGreen = "\x1b[42m",
    BgYellow = "\x1b[43m",
    BgBlue = "\x1b[44m",
    BgMagenta = "\x1b[45m",
    BgCyan = "\x1b[46m",
    BgWhite = "\x1b[47m"
}

const enum LoggerLevel {
    INFO = 1 << 1,
    ERROR = 1 << 2,
    WARN = 1 << 3,
    DEBUG = 1 << 4
}

interface ILevelDecorator {
    tag: string;
    foreground?: string;
    background?: string
}

const levelsDecorator: Record<LoggerLevel, ILevelDecorator> = {
    [LoggerLevel.INFO]: {
        tag: "info",
        foreground: ForegroundColors.FgCyan,
        background: BackgroundColors.BgCyan
    },
    [LoggerLevel.DEBUG]: {
        tag: "debug",
        foreground: ForegroundColors.FgGreen,
        background: BackgroundColors.BgGreen
    },
    [LoggerLevel.WARN]: {
        tag: "warn",
        foreground: ForegroundColors.FgYellow,
        background: BackgroundColors.BgYellow
    },
    [LoggerLevel.ERROR]: {
        tag: "error",
        foreground: ForegroundColors.FgRed,
        background: BackgroundColors.BgRed
    },
}

interface ILoggerConfig {
    home: string;
    // dir: string;
    module?: string;

    bufferSize: number;
    flushInterval: number;
    fileTransport: number;
    stdoutTransport: number;
}

type ILoggerUserConfig = Omit<ILoggerConfig, 'home' | 'dir'>

const DEFAULT_BUFFER_SIZE = 64 * 1024 * 1024;
const DEFAULT_DIRNAME = "log";
const DEFAULT_FLUSH_INTERVAL = 15_000;

const DEFAULT_FILENAME = "ila.log";

const DEFAULT_CONFIG: ILoggerConfig = {
    home: ILA_LOG_DIR_PATH,
    // dir: DEFAULT_DIRNAME,
    bufferSize: DEFAULT_BUFFER_SIZE,
    flushInterval: DEFAULT_FLUSH_INTERVAL,
    fileTransport:
        LoggerLevel.ERROR | LoggerLevel.INFO,
    stdoutTransport: LoggerLevel.DEBUG
        | LoggerLevel.INFO
        | LoggerLevel.WARN
        | LoggerLevel.ERROR,
}

class FileLogger {
    private stream?: WriteStream;
    private opening = false;
    private path: string;
    private buffer: string[] = [];
    private flushTimer?: NodeJS.Timer;

    public constructor(private config: ILoggerConfig) {
        this.path = config.home;
    }

    public write(content: string) {
        this.buffer.push(content);

        if (this.config.bufferSize <= this.buffer.length) {
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
                this.flushTimer = undefined;
            }

            this.flush();
        }

        if (!this.flushTimer) {
            this.flushTimer = setInterval(
                () => this.flush(),
                this.config.flushInterval
            );
        }
    }

    public async open() {
        if (this.opening || this.stream) return;
        this.opening = true;
        try { await stat(this.path); } catch (error) {
            await this.createLogFolder();
        }
        this.stream = createWriteStream(
            path.join(this.path, DEFAULT_FILENAME),
            { encoding: "utf-8", flags: "a" }
        );
        this.stream.on("error", error => Logger.error("Logger stream error:", error));
        this.opening = false;
    }

    public terminate() {
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flush();
        this.stream?.end();
        this.stream = undefined;
    }

    private async createLogFolder() {
        await mkdir(this.path);
    }

    private flush() {
        const data = this.buffer.join("\n");
        this.stream?.write(data + "\n");
        this.buffer.length = 0;
        return;
    }
}

export class Logger {
    private static readonly INSTANCE = new Logger();
    private static readonly FILE_LOGGER = new FileLogger(DEFAULT_CONFIG);
    private config: ILoggerConfig;

    constructor(config: Partial<ILoggerUserConfig> = {}) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config
        }
    }

    public static async init() {
        try {
            const fileLogger = Logger.FILE_LOGGER;
            await fileLogger.open();
        } catch (error) { Logger.error("logger init error:", error) }
    }

    public static terminate() {
        return Logger.FILE_LOGGER.terminate();
    }

    public static log = Logger.INSTANCE.log.bind(Logger.INSTANCE);
    public static error = Logger.INSTANCE.error.bind(Logger.INSTANCE);
    public static warn = Logger.INSTANCE.warn.bind(Logger.INSTANCE);
    public static debug = Logger.INSTANCE.debug.bind(Logger.INSTANCE);

    public log(...args: any[]) {
        const buffer = util.format(...args);
        this.write(LoggerLevel.INFO, buffer);
    }

    public error(...args: any[]) {
        const buffer = util.format(...args);
        this.write(LoggerLevel.ERROR, buffer);
    }

    public warn(...args: any[]) {
        const buffer = util.format(...args);
        this.write(LoggerLevel.WARN, buffer);
    }

    public debug(...args: any[]) {
        const buffer = util.format(...args);
        this.write(LoggerLevel.DEBUG, buffer);
    }

    private write(level: LoggerLevel, data: string, config = this.config) {
        const {
            stdoutTransport,
            fileTransport
        } = config;

        if (!config.stdoutTransport || !config.fileTransport) return;

        const date = new Date();
        const decorator = levelsDecorator[level];
        if (stdoutTransport && stdoutTransport & level) {
            const time = `${decorator.foreground}[${date.toLocaleTimeString()}]${SpecialSymbols.Reset}`;
            const tag = `${SpecialSymbols.Bright}${decorator.background} ${decorator.tag} ${SpecialSymbols.Reset}`;
            const pointer = `${decorator.foreground}${SpecialSymbols.Blink}>>${SpecialSymbols.Reset}`;
            const module = config.module ? `${ForegroundColors.FgWhite}(${config.module})${SpecialSymbols.Reset}` : "";
            const prefix = `${time} ${module} ${tag} ${pointer}`.replace(/\s+/g, " ");
            process.stdout.write(`${prefix} ${data}\n`);
        }

        if (fileTransport && fileTransport & level) {
            const time = `[${date.toLocaleString("ru")}]`;
            const module = config.module ? `(${config.module})` : "";
            const tag = `[${decorator.tag.toUpperCase()}]:`;
            const line = `${time} ${module} ${tag} ${data}`;

            Logger.FILE_LOGGER.write(line);
        }
    }
}