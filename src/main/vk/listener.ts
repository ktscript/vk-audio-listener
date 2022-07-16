import { getAccountHash, getRandomElement } from "@main/utils";
import { IListenTask } from "@main/types";
import { AudioContext, AudioStopReason, getPlaylistFullId, IAudio } from "@main/vk/base/audio";
import { Logger } from "@utils/logger";
import { randomInteger, sleep } from "@utils/helpers";
import { EventEmitter } from "stream";
import { AccountController, TaskController } from "./controllers";
import { VKAccount } from "./base";
import { AudioException, ILADataErrorCode, ILADataException, ILADataFlag } from "@main/exceptions";
import { AudioRejectKind } from "@main/exceptions/audio_exception";
import AbortController from "abort-controller";

const logger = new Logger({ module: "listener" });

type ListenerEventType = "started" | "stoped" | "task-completed" | "error" | "account-refused";

class ListenerEventEmitter extends EventEmitter {
    public on = (event: ListenerEventType, fn: (...args: any[]) => void) => super.on(event, fn);
    public emit = (event: ListenerEventType, ...args: any[]) => super.emit(event, ...args);
}

export enum VKListenerErrorType {
    DATA_REQUIRED,
    FAILED
}

export class VKListenerError extends Error {
    public constructor(public type: VKListenerErrorType, public data?: any, message?: string) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
    }
}

const WAITING_TASKS_MS = 3_000;
const MIN_ACCOUNTS_SLEEP_MS = 2_000;
const MAX_ACCOUNTS_SLEEP_MS = 10_000;
const MIN_LISTEN_DURATION_MS = 35_000;
const MIN_NEXT_TASK_MS = 30_000;
const MAX_NEXT_TASK_MS = 90_000;
const UPDATE_TASK_MS = 50_000;

class ListenerTaskCache {
    public lastUpdateTime = -1;
    public forceUpdate = true;
    public audioIndex = 0;
    public prev?: string;
    public lastQueueRequest?: NodeJS.Timer;
    public cachedAudios: Set<string>;

    constructor(public data: IListenTask) {
        if (data.human == undefined) data.human = false;
        if (data.favorite == undefined) data.favorite = false;

        this.cachedAudios = new Set();
    }

    public get currentAudio() {
        return this.audios[this.audioIndex];
    }

    public next() {
        const audios = this.audios.length;
        this.audioIndex++;
        if (this.audioIndex >= audios) {
            this.audioIndex = 0;
        }
    }

    public get audios() {
        return this.data.playlist.audioList;
    }
}

class VKAccountListener {
    private tasks: Map<string, ListenerTaskCache>;
    private waitingMilliseconds = -1;

    public constructor(public account: VKAccount) {
        this.tasks = new Map();
    }

    public get waiting() {
        return Date.now() < this.waitingMilliseconds;
    }

    public sleep(ms: number) {
        this.waitingMilliseconds = Date.now() + ms;
        return this;
    }

    public terminate() { }

    public clear() {
        this.tasks.clear();
        return this;
    }

    public async listen(listenerTask: IListenTask) {
        if (!listenerTask.enabled) return;
        if (this.waiting) return;
        const task = this.initTask(listenerTask);
        if (this.needUpdate(task)) {
            await this.updateTask(task);
        }
        const audio = task.currentAudio;
        await this.listenAudio(audio, task);
        task.prev = audio.fullId;
        task.next();
    }

    private async listenAudio(audio: IAudio, task: ListenerTaskCache) {
        const { human, favorite } = task.data;
        const audioDuration = randomInteger(MIN_LISTEN_DURATION_MS / 1000, audio.duration);
        const nextDelay = randomInteger(MIN_NEXT_TASK_MS, MAX_NEXT_TASK_MS);

        logger.log(
            "Listening playlist %s. Current audio (listen: %i sec): %s",
            task.data.playlist.title,
            audioDuration.toFixed(2),
            audio.title,
            !human ? "(not alive)" : ""
        );

        await this.account.audio.startPlayback(audio);
        const playlistId = getPlaylistFullId(task.data.playlist);

        if (!task.cachedAudios.has(audio.fullId) && favorite) {
            try {
                await this.account.audio.addAudio(audio, task.data.playlist);
                task.cachedAudios.add(audio.fullId);
                logger.log(
                    "Audio %s added to account (%s) library ",
                    audio.title,
                    this.account.toString()
                );
            } catch (error) { }
        }

        const audioContext = getRandomElement([
            AudioContext.ALBUM_PAGE,
            AudioContext.GROUP_LIST,
            AudioContext.USER_LIST,
            AudioContext.MY
        ]);

        const endStreamReason = getRandomElement([
            AudioStopReason.NEXT_BUTTON,
            AudioStopReason.STOP_BUTTON,
            AudioStopReason.PLAYLIST_NEXT,
        ]);

        const state = Math.random() > .5 ? "background" : "app";
        const humanOptions: any = {
            context: audioContext,
            listened: audioDuration,
            prev: task.prev,
            end_stream_reason: endStreamReason,
            state
        }

        const defaultOptions: any = {
            listened: MIN_LISTEN_DURATION_MS / 1000,
            state: "background",
        }

        const options = human ? humanOptions : defaultOptions;
        await this.account.audio.listenAudio(audio, playlistId, options);

        this.sleep(nextDelay);
    }

    private async updateTask(task: ListenerTaskCache) {
        const { audio } = this.account;
        const { data } = task;
        data.playlist = await audio.fetchPlaylist(data.playlist);
        data.progress.actual = data.playlist.listens;
        task.lastUpdateTime = Date.now();
    }

    private needUpdate(task: ListenerTaskCache): boolean {
        if (task.forceUpdate) {
            task.forceUpdate = false;
            task.lastUpdateTime = Date.now();
            return true;
        }

        return (task.lastUpdateTime + UPDATE_TASK_MS) < Date.now();
    }

    private initTask(task: IListenTask) {
        let cached = this.tasks.get(task.id);
        if (!cached) {
            cached = new ListenerTaskCache(task);
            this.tasks.set(task.id, cached);
        }

        return cached;
    }
}

export class VKAudioListener<T> extends ListenerEventEmitter {
    private running = false;
    private cache: Map<string, VKAccountListener>;

    public constructor(
        private tasks: TaskController<T>,
        private accounts: AccountController<T>
    ) {
        super();
        this.cache = new Map();
    }

    public get isRunning() {
        return this.running;
    }

    public start() {
        if (this.running) return;
        if (!this.ready) {
            this.check();
            return;
        }
        this.running = true;
        this.emit("started");
        this.loop();
    }

    public stop() {
        if (!this.running) return;
        this.running = false;
        this.tasks
            .get()
            .forEach(task => task.performed = false);
        this.emit("stoped");
    }

    public reload() {
        if (!this.running) return;
        this.stop();
        this.start();
    }

    private check() {
        let required = 0;

        if (this.accounts.length == 0) {
            required |= ILADataFlag.ACCOUNTS;
        }

        if (this.tasks.length == 0) {
            required |= ILADataFlag.TASKS;
        }

        throw new ILADataException(
            "Not enough accounts or tasks for starting the listener",
            ILADataErrorCode.NOT_ENOUGH,
            required
        );
    }

    private loop() {
        const TASKS_CHUNK_SIZE = 4;
        const ACCOUNTS_CHUNK_SIZE = 30;

        let tasksChunkOffset = 0;
        let accountsChunkOffset = 0;

        const run = async () => {
            if (!this.running) return;

            const enabledTasks = this.tasks.get({ enabled: true });
            const authorizedAccounts = this.accounts.get({ authorized: true });
            const tasks = enabledTasks.length > TASKS_CHUNK_SIZE ? enabledTasks.slice(
                tasksChunkOffset * TASKS_CHUNK_SIZE,
                tasksChunkOffset * TASKS_CHUNK_SIZE + TASKS_CHUNK_SIZE
            ) : enabledTasks;

            const listeners = authorizedAccounts.length > ACCOUNTS_CHUNK_SIZE ? authorizedAccounts.slice(
                accountsChunkOffset * ACCOUNTS_CHUNK_SIZE,
                accountsChunkOffset * ACCOUNTS_CHUNK_SIZE + ACCOUNTS_CHUNK_SIZE
            ) : authorizedAccounts;

            if (++tasksChunkOffset >= Math.ceil(enabledTasks.length / TASKS_CHUNK_SIZE)) tasksChunkOffset = 0;
            if (++accountsChunkOffset >= Math.ceil(authorizedAccounts.length / ACCOUNTS_CHUNK_SIZE)) accountsChunkOffset = 0;

            if (tasks.length < 1) {
                this.cache.forEach(data => data.clear());
                logger.log("Waiting for tasks...");
                await sleep(WAITING_TASKS_MS);
                return;
            }

            if (listeners.length < 1) {
                logger.log("Waiting for listeners/accounts...");
                await sleep(WAITING_TASKS_MS);
                return;
            }

            try {
                const promise = tasks.map(task => this.listenTask(listeners, task));
                await Promise.all(promise);
            } catch (error) { }

            logger.log("Iteration completed!");
            this.updateTasks();
            setTimeout(run, 15_000);
        }

        run();
    }

    private listenTask(listeners: VKAccount[], task: IListenTask) {
        if (!task.enabled) {
            task.performed = false;
            return;
        }

        task.performed = true;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 120_000);

        return new Promise(async (resolve, reject) => {
            controller.signal.onabort = () => reject(new Error("Listen aborted"));
            const promises = listeners.map(listener => this.listenTaskByAccount(task, listener));
            await Promise.all(promises);
            return resolve(true);
        }).finally(() => clearTimeout(id));
    }

    private async listenTaskByAccount(task: IListenTask, account: VKAccount) {
        if (!task.enabled) return;

        const accountHash = getAccountHash(account.pure);
        if (!this.cache.has(accountHash)) {
            const listener = new VKAccountListener(account);
            this.cache.set(accountHash, listener);
        }

        const listener = this.cache.get(accountHash);
        try { await listener!.listen(task); } catch (error: any) {
            const sleepDelay = randomInteger(MIN_ACCOUNTS_SLEEP_MS, MAX_ACCOUNTS_SLEEP_MS);
            const isConnectionAbort = error.name == "FetchError" || error.name == "AbortError";
            const isAuthorizationError = error instanceof AudioException && error.kind === AudioRejectKind.AuthFailed;

            if (isConnectionAbort) {
                logger.log(
                    "Connection refused: (%s) | %s. Sleep time: %i sec",
                    listener!.account.toString(),
                    account.getProxy()?.toString(),
                    sleepDelay / 1000
                );
                return listener!.sleep(sleepDelay);
            }

            if (isAuthorizationError) {
                logger.warn(
                    "Authorization account %s error: %s. Refreshing account...",
                    listener!.account.toString(),
                    error.message
                );

                await listener!.account.check();
                listener!.sleep(sleepDelay)
                return;
            }

            logger.error("Listening to the track is suddenly suspended", error);
        }
    }

    private updateTasks() {
        for (let task of this.tasks.get()) {
            if (!task.enabled || !task.performed) task.timeLeft = 0;
            const { actual, target } = task.progress;
            if (actual >= target) {
                this.releaseTask(task);
                continue;
            }

            const listeners = this.accounts.get({ authorized: true }).length;
            const remined = target - actual;
            const infelicity = 50_000;
            const delay = (MIN_LISTEN_DURATION_MS + MIN_NEXT_TASK_MS + infelicity) / 1000;
            const approximateSeconds = (remined / listeners) * delay;
            const current = Date.now();

            task.timeLeft = current + approximateSeconds * 1000;
        }
    }

    private releaseTask(task: IListenTask) {
        try {
            task.enabled = false;
            task.deleted = true;
            task.performed = true;
            this.tasks.delete(task.id);
            this.emit("task-completed", task);
        } catch (error) { logger.error("Task delete error:", error) }
    }

    private get ready() {
        return this.accounts.length > 0 && this.tasks.length > 0;
    }
}