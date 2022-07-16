import { Logger } from "@utils/logger";
import Koa from "koa";
import koaBody from "koa-body"
import KoaRouter from "koa-router";
import https from "https";
import http from "http";
import { ILAResourceStorage } from "./data_storage";
import ApplicationSettings from "./app_settings";

const logger = new Logger({ module: "webhook" });

type CallbackHandler = (data: any) => void;

export class ILAWebhook {
    public static readonly WEBHOOK_ROUTE_PATH = "/webhook";
    private callback?: CallbackHandler;
    private koa = new Koa();
    private server!: https.Server | http.Server;
    private running = false;

    public constructor(
        private settings: ApplicationSettings,
        private storage: ILAResourceStorage
    ) {
        this.koa.use(
            koaBody({
                multipart: true,
                encoding: "utf-8"
            })
        );
        this.koa.use(this.createRouter().routes());
    }

    public get started() {
        return this.running;
    }

    public hasSSL() {
        return this.certificateExists();
    }

    public setCallback(callback: CallbackHandler) {
        this.callback = callback;
        return this;
    }

    public start() {
        if (this.running) return;
        const port = this.settings.getWebhookPort();
        this.server = this.createServer();
        this.server.listen(port, "0.0.0.0", () => this.running = true);
    }

    public stop() {
        if (!this.running) return;
        this.server.close();
    }

    private createServer() {
        const exists = this.certificateExists();
        return exists
            ? https.createServer(this.createCertificates(), this.koa.callback())
            : http.createServer(this.koa.callback());
    }

    private certificateExists() {
        const { certificate } = this.storage;
        return certificate.has("key") && certificate.has("cert");
    }

    private createCertificates() {
        const { certificate } = this.storage;
        const key = certificate.readFile("key");
        const cert = certificate.readFile("cert");

        return { key, cert }
    }

    private createRouter() {
        const router = new KoaRouter();
        router.get(ILAWebhook.WEBHOOK_ROUTE_PATH, (context, next) => {
            context.body = "ok";
            return next();
        })

        router.post(ILAWebhook.WEBHOOK_ROUTE_PATH, (context, next) => {
            const { body } = context.request;

            if (typeof this.callback == "function") process.nextTick(() => this.callback!(body));
            context.body = true;
            return next();
        })

        return router;
    }
}