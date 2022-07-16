import nodeFs, { existsSync, readFileSync } from "fs";
import path, { join as joinPath } from "path";
import { IProxyData } from "@main/net";
import {
    createEmptyCache,
    normalizeCache, ICache, IVKAccountJSON, ILASettings, normalizeSettings, createDefaultSettings
} from "@main/types";
import FileStorage from "@main/io/storage";
import EventEmitter from "events";
import { jsonTryToParse } from "./utils/helpers";
import { FileException } from "@main/exceptions";
import { FileErrorCode } from "@main/exceptions/file_exception";
import { mkdir, writeFile } from "fs/promises";
import { DATA_STORAGE_DEFAULTS, ILA_CERTIFICATES_PATH, ILA_RESOURCES_PATH, ILA_USER_DATA_PATH } from "@utils/constants";

interface DataStorageOptions {
    filename: {
        accounts: string;
        proxies: string;
        cache: string;
        settings: string;
    }
}

const safeParseJsonFile = <T>(raw: string, file: FileStorage<T>) => {
    const jsonResult = jsonTryToParse(raw);
    if (!jsonResult) throw new FileException({
        code: FileErrorCode.FormatError,
        message: "Incorrect file content format",
        path: file.path
    });

    return jsonResult as T;
}

export type AccountsStorage = FileStorage<IVKAccountJSON[]>;
export type ProxyStorage = FileStorage<IProxyData[]>;
export type CacheStorage = FileStorage<ICache>;
export type SettingsStorage = FileStorage<ILASettings>;

interface ICertificateStorageOptions {
    rootPath: string;
    key: string;
    cert: string;
}

type CertificateFileType = "cert" | "key";

class CertificateStorage {
    public constructor(private options: ICertificateStorageOptions) { }

    public has(filename: CertificateFileType) {
        const path = this.getRelationPath(filename);
        return existsSync(path);
    }

    public async createFile(filename: CertificateFileType, buffer: Buffer) {
        await writeFile(
            this.getRelationPath(filename),
            buffer
        );
    }

    public readFile(filename: CertificateFileType) {
        return readFileSync(this.getRelationPath(filename));
    }

    private getRelationPath(filename: CertificateFileType) {
        const { rootPath } = this.options;
        return path.join(rootPath, filename);
    }
}

export class ILAResourceStorage extends EventEmitter {
    public cache: CacheStorage;
    public proxies: ProxyStorage;
    public settings: SettingsStorage;
    public accounts: AccountsStorage;
    public certificate: CertificateStorage;

    public constructor(options: DataStorageOptions) {
        super();

        this.certificate = new CertificateStorage({
            rootPath: ILA_CERTIFICATES_PATH,
            cert: "cert",
            key: "key"
        });

        this.accounts = new FileStorage<IVKAccountJSON[]>({
            path: joinPath(ILA_USER_DATA_PATH, options.filename.accounts),
            transformInput: async (raw: string) => {
                try {
                    const data = safeParseJsonFile(raw, this.accounts);
                    const accounts: IVKAccountJSON[] = [];

                    for (let account of data) {
                        let hasLogin = "login" in account;
                        let hasPassword = "password" in account;

                        if (!hasLogin || !hasPassword) {
                            continue;
                        }

                        if (typeof account.session != "object") {
                            account.session = { cookies: {}, valid: true, authorized: false };
                        }

                        accounts.push(account);
                    }

                    return accounts;
                } catch (error) {
                    this.emit("error", error);
                    const content = [];
                    await this.restoreFile(this.accounts, content);

                    return content;
                }
            },

            transformOutput: (object: IVKAccountJSON[]) => {
                return JSON.stringify(object);
            }
        });

        this.proxies = new FileStorage<IProxyData[]>({
            path: joinPath(ILA_USER_DATA_PATH, options.filename.proxies),
            transformInput: async (raw: string) => {
                try {
                    const data = safeParseJsonFile(raw, this.proxies);
                    const proxies: IProxyData[] = [];

                    for (let proxy of data) {
                        if (!proxy.address || !proxy.port || !proxy.type) continue;
                        proxies.push(proxy);
                    }

                    return proxies;
                } catch (error) {
                    this.emit("error", error);
                    const content = [];
                    await this.restoreFile(this.proxies, content)

                    return content;
                }
            },
            transformOutput: (object: IProxyData[]) => JSON.stringify(object)
        });

        this.cache = new FileStorage<ICache>({
            path: joinPath(ILA_USER_DATA_PATH, options.filename.cache),
            transformInput: async (raw: string) => {
                try {
                    const data = safeParseJsonFile(raw, this.cache);
                    const normalized = normalizeCache(data)
                    this.cache.data = normalized;
                    await this.cache.save();
                    return normalized;
                } catch (error) {
                    this.emit("error", error);
                    const emptyCache = createEmptyCache();
                    await this.restoreFile(this.cache, emptyCache);
                    return emptyCache;
                }
            },
            transformOutput: (object) => JSON.stringify(object)
        });

        this.settings = new FileStorage<ILASettings>({
            path: joinPath(ILA_USER_DATA_PATH, options.filename.settings),
            transformInput: async (raw: string) => {
                try {
                    const data = safeParseJsonFile(raw, this.settings);
                    const normalized = normalizeSettings(data);
                    this.settings.data = normalized;
                    await this.settings.save();
                    return normalized;
                } catch (error) {
                    this.emit("error", error);
                    const content = createDefaultSettings();
                    await this.restoreFile(this.settings, content);
                    return content;
                }
            },
            transformOutput: (object) => JSON.stringify(object)
        });
    }

    public async read() {
        await this.check();
        return Promise.all([
            this.cache.read(),
            this.proxies.read(),
            this.accounts.read(),
            this.settings.read()
        ]);
    }

    public save() {
        return Promise.all([
            this.cache.save(),
            this.proxies.save(),
            this.accounts.save(),
            this.settings.save()
        ]);
    }

    private async check() {
        const { existsSync } = nodeFs;

        if (!existsSync(ILA_RESOURCES_PATH)) {
            await mkdir(ILA_RESOURCES_PATH);
        }

        if (!existsSync(ILA_CERTIFICATES_PATH)) {
            await mkdir(ILA_CERTIFICATES_PATH);
        }

        if (!existsSync(ILA_USER_DATA_PATH)) {
            await mkdir(ILA_USER_DATA_PATH);
        }

        if (!existsSync(this.settings.path)) {
            await writeFile(
                this.settings.path,
                JSON.stringify(createDefaultSettings())
            )
        }

        if (!existsSync(this.cache.path)) {
            await writeFile(
                this.cache.path,
                JSON.stringify(createEmptyCache())
            );
        }

        if (!existsSync(this.accounts.path)) {
            await writeFile(
                this.accounts.path,
                JSON.stringify([])
            );
        }

        if (!existsSync(this.proxies.path)) {
            await writeFile(
                this.proxies.path,
                JSON.stringify([])
            );
        }
    }

    private async restoreFile<T>(file: FileStorage<T>, content: any) {
        try {
            file.data = content;
            await file.save();
            this.emit("restored", {
                file: path.parse(file.path),
                content
            });
        } catch (error) { this.emit("error", error); }
    }
}

export const initDataStorage = () => {
    const {
        accountsFilename,
        cacheFilename,
        proxyFilename,
        settingsFilename
    } = DATA_STORAGE_DEFAULTS;

    return new ILAResourceStorage({
        filename: {
            accounts: accountsFilename,
            cache: cacheFilename,
            proxies: proxyFilename,
            settings: settingsFilename
        }
    })
}