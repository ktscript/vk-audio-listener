import anticaptcha from "@antiadmin/anticaptchaofficial"
import { fetchImageAsBase64 } from "@main/utils";
import { Captcha, CaptchaTypes, GoogleCaptchaData, ImageCaptchaData } from "./captcha";

export default new class AntiCaptcha {
    private key: string;

    constructor(key?: string) {
        this.key = key ?? "";
        anticaptcha.shutUp();
    }

    public getKey() {
        return this.key;
    }

    public setKey(value: string) {
        anticaptcha.setAPIKey(value);
        this.key = value;
    }

    public getBalance() {
        return anticaptcha.getBalance();
    }

    public async isValidKey(key: string) {
        let tempKey = this.key;
        this.setKey(key);

        try {
            await this.getBalance();
        } catch (error) {
            this.setKey(tempKey);
            return false;
        }

        return true;
    }

    public async checkAndGetBalance() {
        let balance = await this.getBalance();

        if (balance < .1)
            throw new AntiCaptchaError("The anticaptcha account balance is less than 10! Please, top up your account balance.");

        return balance;
    }

    public solveCaptcha(payload: Captcha): Promise<Captcha> {
        switch (payload.type) {
            case CaptchaTypes.Image: {
                let imageCaptchaData = payload.getImageCaptchaData();
                return this.solveImageCaptcha(imageCaptchaData);
            }

            case CaptchaTypes.GoogleCaptcha: {
                let googleCaptchaData = payload.getGoogleCaptchaData();
                return this.solveGoogleCaptcha(googleCaptchaData);
            }

            default: throw new AntiCaptchaError("Unrecognized captcha type.");
        }
    }

    private async solveImageCaptcha(imageCaptchaData: ImageCaptchaData) {
        const { imageSource } = imageCaptchaData;
        const base64 = imageSource instanceof Buffer
            ? imageSource.toString("base64")
            : await fetchImageAsBase64(imageSource as string);

        const solveResult = await anticaptcha.solveImage(base64);

        return new Captcha(
            CaptchaTypes.Image,
            {
                ...imageCaptchaData,
                captchaKey: solveResult
            } as ImageCaptchaData
        );
    }

    private async solveGoogleCaptcha(googleCaptchaData: GoogleCaptchaData): Promise<Captcha> {
        throw new AntiCaptchaError("Not implemented the Google anti-captcha.");
    }
}

export class AntiCaptchaError extends Error {
    constructor(message: string) {
        super(message);

        Error.captureStackTrace(this, this.constructor);
    }
}