
import { IVKAccountJSON } from "@main/types";
import LibraryException from "./library_exception";

export enum AuthErrorCode {
    PageBlocked,
    CaptchaRequired,
    TwoFactorRequired,
    SecurityCheckRequired,
    InviteConfirmationRequired,
    Failed,
}

interface AuthorizationExceptionOptions {
    message: string;
    code: AuthErrorCode,
    payload?: any;
}

export default class AuthorizationException extends LibraryException {
    public code: AuthErrorCode;
    public payload?: any;
    public account?: IVKAccountJSON;

    constructor(options: AuthorizationExceptionOptions) {
        super(options.message);

        this.code = options.code;
        this.payload = options.payload;
    }
}