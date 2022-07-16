export interface ImageCaptchaData {
    imageSource: string | Buffer;
    captchaSid: string;
    captchaKey?: string;
}

export interface GoogleCaptchaData {
    websiteUrl: string;
    websiteKey?: string;
    websiteSToken?: string;
    recaptchaDataSValue?: string;
    isInvisible?: boolean;
}

export const enum CaptchaTypes {
    Image,
    GoogleCaptcha
}

export type CaptchaHandler = (payload: Captcha) => Promise<Captcha>;

export class Captcha {
    public constructor(
        public type: CaptchaTypes,
        public data: ImageCaptchaData | GoogleCaptchaData
    ) { }

    getImageCaptchaData() {
        return this.data as ImageCaptchaData;
    }

    getGoogleCaptchaData() {
        return this.data as GoogleCaptchaData;
    }

    setCaptchaKey(value: string) {
        this.getImageCaptchaData().captchaKey = value;

        return this;
    }
}