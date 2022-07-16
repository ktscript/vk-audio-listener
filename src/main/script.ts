import vm from "vm";
import { getRandomString } from "@main/utils";
import { ILAApplication } from ".";
import ilaEventBus from "../event_bus";

export enum ILAScriptExecuteReason {
    WhenReceivedWebhookRequest = 1,
    WhenApplicationRun = 2
}

export const ILA_SCRIPT_EXECUTE_REASON_STRINGS = {
    [ILAScriptExecuteReason.WhenApplicationRun]: "при запуске приложения",
    [ILAScriptExecuteReason.WhenReceivedWebhookRequest]: "при получении Webhook-запроса",
}

export interface ILAScriptJSON {
    name: string;
    code: string;
    reason: number;
    id: string;
}

class ILAScript {
    public constructor(
        public name: string,
        public code: string,
        public reason: ILAScriptExecuteReason,
        public id: string = getRandomString(16)
    ) { }

    public toJSON(): ILAScriptJSON {
        return {
            name: this.name,
            code: this.code,
            reason: this.reason,
            id: this.id
        }
    }
}

export class ILAScriptExecuteError extends Error {
    public constructor(
        public script: ILAScript,
        public message: string) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
    }
}

interface IScriptContext {
    args: any[];
    ila: any;
}

export class ILAScriptManager {
    private scripts: ILAScript[];
    private extraContext: any = {};

    public constructor(
        private parent: ILAApplication,
        scripts: ILAScriptJSON[]
    ) {
        this.scripts = scripts.map(
            json => new ILAScript(
                json.name,
                json.code,
                json.reason,
                json.id
            )
        );
    }

    public setExtraContext(context: any) {
        this.extraContext = context;
        return this;
    }

    public execute(reason: ILAScriptExecuteReason, ...args: any[]) {
        const scripts = this.getByExecuteReason(reason);
        const context = createScriptContext(this.parent, this.extraContext, args);
        scripts.forEach(script => this.executeScript(script, context));
    }

    private async executeScript(script: ILAScript, context: any) {
        try { await vm.runInContext(script.code, context, { timeout: 15_000 }) } catch (error) {
            ilaEventBus.emit("error",
                new ILAScriptExecuteError(script, (error as Error).message)
            );
        }
    }

    private getByExecuteReason(reason: ILAScriptExecuteReason) {
        return this.scripts.filter(script => script.reason === reason);
    }

    public add(
        name: string,
        code: string,
        reason: ILAScriptExecuteReason
    ) {
        const script = new ILAScript(
            name,
            code,
            reason
        );
        this.scripts.push(script);
        return this;
    }

    public delete(id: string) {
        const index = this.scripts.findIndex(script => script.id == id);
        if (index == -1) throw new Error("Script not found");
        return this.scripts.splice(index, 1);
    }

    public getScriptsJSON(): ILAScriptJSON[] {
        return this.scripts.map(script => script.toJSON());
    }
}

function createScriptContext(parent: ILAApplication, extra: any = {}, args: any[] = []) {
    const tasks = {
        async add(url: string, count: number) {
            const { vk } = parent;
            const playlist = await vk.getPlaylistByUrl(url);
            if (!playlist) throw new Error("Invalid playlist url.");
            vk.tasks.add({ playlist, totalCount: count });
            return true;
        }
    };

    const ilaContext: IScriptContext = {
        args,
        ila: {
            ...extra,
            tasks
        }
    }

    return vm.createContext(ilaContext)
}