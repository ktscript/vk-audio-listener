import { ILAProxy, IProxyData, ProxyType } from "@main/net";
import { checkProxies } from "@main/net/checker";
import {
    ICache,
    IVKAccountJSON,
    IVKPureAccount,
    IListenTask
} from "@main/types";
import { getRandomString, parseProxies } from "@main/utils";
import { Logger } from "@utils/logger";
import { VKAccount } from "./base";
import { IPlaylistContentInfo } from "./base/audio";

abstract class DataController<T> {
    public constructor(protected parent: T) { }
}

const logger = new Logger({ module: "account" });

export class AccountController<T> extends DataController<T> {
    private accounts: VKAccount[];
    public constructor(
        parent: T,
        accounts: IVKAccountJSON[]
    ) {
        super(parent);
        this.accounts = accounts.map(VKAccount.createFromJSON);
    }

    public get length() {
        return this.accounts.length;
    }

    public addString(text: string) {
        const pattern = /(\S+):(\S+)/;
        const dirtAccounts = text.trim().split("\n").map(line => {
            const result = line.match(pattern);
            if (!result) return false;
            const [, login, password] = result!;
            return { login, password };
        });

        const pureAccounts = dirtAccounts.filter(a => a) as IVKPureAccount[];
        this.add(pureAccounts);

        return {
            total: dirtAccounts.length,
            added: pureAccounts.length
        }
    }

    public deleteInvalid() {
        const invalidAccounts = this.getInvalidAccounts();
        const invalidCount = invalidAccounts.length;
        if (!invalidAccounts.length) return {
            invalidCount: 0,
            deletedCount: 0
        };

        const deletedCount = invalidAccounts
            .map(this.delete.bind(this))
            .filter(status => status)
            .length;

        return Object.freeze({ invalidCount, deletedCount });
    }

    public clear() {
        this.accounts.length = 0;
    }

    public async clearSessions() {
        const promises = this.accounts.map(account => account.clear());
        await Promise.all(promises);
    }

    public async validate(accounts = this.get({ authorized: true })): Promise<AccountValidateResponse[]> {
        const promises = accounts.map(async (account, index) => {
            const response: AccountValidateResponse = { account, status: false };
            try {
                logger.debug("(%i / %i) Account %s checking...", index + 1, accounts.length, account.toString());
                response.status = await account.check();
                logger.debug("(%i / %i) Account %s checked!", index + 1, accounts.length, account.toString());
            } catch (error: any) {
                response.status = false;
                response.error = error;
            }
            return response;
        });

        return await Promise.all(promises);

    }

    public get(filter?: { authorized?: boolean }): VKAccount[] {
        if (filter?.authorized != undefined) {
            return !filter.authorized
                ? this.getUnauthorizedAccounts()
                : this.getAuthorizedAccounts();
        }

        return this.accounts;
    }

    private add(elementOrArray: IVKPureAccount | IVKPureAccount[]) {
        Array.isArray(elementOrArray)
            ? elementOrArray.forEach(this.addUnique.bind(this))
            : this.addUnique(elementOrArray);
        return this;
    }

    private addUnique(account: IVKPureAccount) {
        const result = this.find(account);
        if (result) return false;
        this.normalize(account);
        const object = VKAccount.createFromJSON(account)
        this.accounts.push(object);

        return this;
    }

    private find(account: IVKPureAccount, returnIndex = false) {
        const predicate = a => a.login == account.login && a.password == account.password;
        return returnIndex
            ? this.accounts.findIndex(predicate)
            : this.accounts.find(predicate);
    }

    private normalize(account: IVKAccountJSON) {
        account.session = {
            cookies: {},
            valid: true,
            authorized: false
        }

        return account;
    }

    private delete(account: VKAccount) {
        const index = this.find(account.pure, true) as number;
        if (index == -1) return false;
        this.accounts.splice(index, 1);
        return true;
    }

    private getUnauthorizedAccounts = (accounts = this.get()) => accounts.filter(account => !account.isAuthorized);
    private getInvalidAccounts = (accounts = this.get()) => accounts.filter(account => !account.isValid);
    private getAuthorizedAccounts = (accounts = this.get()) => accounts.filter(account => account.isAuthorized);
}

interface AccountValidateResponse {
    account: VKAccount;
    status: boolean;
    error?: Error;
}

export class ProxyController<T> extends DataController<T> {
    private proxies: ILAProxy[];
    public constructor(
        parent: T,
        proxies: IProxyData[]
    ) {
        super(parent);
        this.proxies = proxies.map(ILAProxy.from);
    }

    public get length() {
        return this.proxies.length;
    }

    public add(type: ProxyType, content: string) {
        const proxies = parseProxies(type, content).map(proxy => {
            const finded = this.find(proxy);
            return finded ? false : proxy;
        }).filter(proxy => proxy) as ILAProxy[];

        this.proxies.push(...proxies);

        return true;
    }

    private find(proxy: IProxyData) {
        return this.proxies.find(p => {
            return p.address == proxy.address && p.port == proxy.port && p.type == proxy.type;
        });
    }

    public deleteInvalid() {
        const invalid = this.proxies.filter(proxy => !proxy.valid);
        logger.warn("deleteInvalid(): Invalid count: ", invalid.length);
        return this.delete(invalid);
    }

    public delete(proxies: IProxyData[]) {
        proxies.forEach(proxyA => {
            const index = this.proxies.findIndex(proxyB => this.compare(proxyB, proxyA));
            if (index == -1) return false;
            const deleteProxies = this.proxies.splice(index, 1);
            logger.warn("delete(): delete proxies: ", deleteProxies.length);
        })

        return this;
    }

    public compare(a: IProxyData, b: IProxyData) {
        return a.address == b.address
            && a.port == b.port
            && a.auth?.username == b.auth?.username
            && a.auth?.password == b.auth?.password;
    }

    public clear() {
        this.proxies.length = 0;
    }

    public get(filter?: ProxyGetFilter) {
        if (filter && filter?.valid != undefined) {
            return this.proxies.filter(proxy => {
                if (proxy.valid == undefined) return false;
                return proxy.valid == filter.valid;
            });
        }

        return this.proxies;
    }

    public async validate() {
        return checkProxies(this.proxies);
    }
}

interface ProxyGetFilter {
    valid?: boolean;
}

interface ITaskSettings {
    enableHuman: boolean;
    enableFavoriteAudio: boolean;
}

interface IAddTaskParams {
    playlist: IPlaylistContentInfo;
    totalCount: number;
    settings?: ITaskSettings;
}

export enum TaskControllerErrorTypes {
    ALREADY_EXISTS = 1,
    INVALID_PARAMS
}

export class TaskControllerError extends Error {
    constructor(public type: TaskControllerErrorTypes, public message: string) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
    }
}

export class TaskController<T> extends DataController<T> {
    public constructor(
        parent: T,
        private data: IListenTask[]
    ) { super(parent); }

    public get length() {
        return this.data.length;
    }

    public set length(value: number) {
        this.data.length = value;
    }

    public map(predicate: (...args: any) => any) {
        return this.data.map(predicate);
    }

    public add(data: IAddTaskParams) {
        if (data.playlist == undefined || data.totalCount == undefined) {
            throw new TaskControllerError(TaskControllerErrorTypes.INVALID_PARAMS, "Invalid params");
        }

        const finded = this.data.find(task => task.playlist.fullId == data.playlist.fullId);
        if (finded) {
            finded.progress.target += data.totalCount;
            return this;
        }

        const task = makeTask(data);
        this.data.push(task);
        return this;
    }

    public set(tasks: IListenTask[]) {
        this.data.push(...tasks);
        return this;
    }

    public get(filter?: Partial<IListenTask>) {
        if (!filter) return this.data;
        const props = Object.keys(filter);
        const excludeTypes = ["object", "function", "undefined"];
        return this.data.filter(task => {
            for (const property of props) {
                const search = filter[property];
                if (excludeTypes.includes(typeof search)) continue;
                if (task[property] != search) continue;

                return true;
            }

            return false;
        })
    }

    public edit(id: string, params: Partial<IListenTask>) {
        const task = this.get({ id });
        const props = Object.keys(params);
        return props.forEach(property => {
            task[property] = params[property];
        })
    }

    public delete(id: string) {
        const index = this.data.findIndex(task => task.id == id);
        if (index == -1) throw new Error("Task with specify id not found");
        this.data[index].enabled = false;
        this.data[index].deleted = true;
        this.data[index].performed = false;
        this.data.splice(index, 1);

        return this;
    }

    public *[Symbol.iterator]() {
        for (let i = 0; i < this.length; i++) {
            yield this.data[i];
        }
    }
}

function makeTask(data: {
    playlist: any,
    totalCount: number,
    settings?: { enableHuman: boolean; enableFavoriteAudio: boolean; }
}): IListenTask {
    return {
        id: getRandomString(16),
        enabled: true,
        human: data.settings?.enableHuman || false,
        favorite: data.settings?.enableFavoriteAudio || false,
        performed: false,
        deleted: false,
        playlist: data.playlist,
        progress: {
            initial: data.playlist.listens,
            actual: data.playlist.listens,
            target: data.playlist.listens + data.totalCount
        },
        timeLeft: 0
    }
}

export class CacheController<T> extends DataController<T> {
    constructor(parent: T, private cache: ICache) {
        super(parent);
    }

    public set lastDataValidationTime(value: number) {
        this.cache.state.lastValidationTime = value;
    }

    public get lastDataValidationTime() {
        return this.cache.state.lastValidationTime || -1;
    }


    public get tasksHistory() {
        return this.cache.tasksHistory;
    }

    public addTaskHistory(task: IListenTask) {
        const finded = this.cache.tasksHistory.find(stored => stored.id == task.id);
        if (finded) return;
        this.cache.tasksHistory.push(task);
    }
}