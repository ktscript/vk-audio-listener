import { IListenTask } from "@main/types";
import getMAC from "@utils/getmac";
import { Logger } from "@utils/logger";
import AbortController from "abort-controller";
import fetch from "node-fetch";
import { stringify } from "querystring";

const ILA_SERVER_TIMEOUT = 5_000;
const logger = new Logger({ module: "ila-server" });

interface IILAServerConfig {
    serverUrl: string;
    machineId: string;
    version: string;
}

class ILAServer {
    private serverUrl?: string;
    private machineId?: string;
    private version?: string;

    private statsBuffer: any[] = [];

    public get inited() {
        return this.version != undefined
            && this.machineId != undefined
            && this.serverUrl != undefined;
    }

    public init(config: IILAServerConfig) {
        this.machineId = config.machineId;
        this.version = config.version;
    }

    public async sendStatistics(data: any) {
        this.statsBuffer.push(data);
        const response = await this.request("/client/send-stats", this.statsBuffer);
        if (!response) return false;
        this.statsBuffer.length = 0;
        
        return response;
    }

    private async request(path: string, data: any, queryParams?: any) {
        if (!this.inited) throw new Error("Server not inited");
        const url = new URL(path, this.serverUrl!);
        url.searchParams.set('machine_id', this.machineId!);
        url.searchParams.set('version', this.version!);

        if (queryParams) {
            for (let prop in queryParams)
                url.searchParams.set(prop, queryParams[prop]);
        }

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ILA_SERVER_TIMEOUT);
        try {
            const response = await fetch(url, {
                method: "POST",
                body: stringify(data),
                headers: { 'content-type': 'application/json' }
            }).finally(() => clearTimeout(id));
            return response.json();
        } catch (error) {
            return false;
        }
    }
}

export const ilaServer = new ILAServer();

interface IVersionInfo {
    major: number;
    minor: number;
    patch: number;
    raw: string;
    stage: string;
    version: string;
}

export function parseVersion(raw: string): IVersionInfo | undefined {
    if (!raw) return;

    // 2.0.0-beta.3 => 2.0.0, beta.3
    const [version, stage] = raw
        .split("-")
        .map(string => string.trim());

    // 2.0.0 => 2, 0, 0
    const [major, minor = 0, patch = 0] = version
        .split(".")
        .map(string => {
            const int = parseInt(string, 10)
            return int || 0;
        });

    if (major == undefined || minor == undefined) throw new Error("Incorrect version")

    return {
        major,
        minor,
        patch,
        raw,
        stage: stage || "release",
        version,
    }
}

function isNewerVersion(local: IVersionInfo, remote: IVersionInfo) {
    return remote.major > local.major
        || remote.minor > local.minor
        || remote.patch > local.patch
        || remote.stage > local.stage;
}