import LibraryException from "./library_exception";

//     case 11:
//     case 12:
//         return Object(g.mobileValidationRequired)(e);
//     case 13:
//         return g.evalCode;
//     case 14:
//         return g.otpBox;
//     case 15:
//         return g.passwordValidationRequired;
//     default:
//         return Object(g.defaultHandler)(e)
// errors: -1 | -2 | -3 

export enum AudioRejectKind {
    EmailNotConfirmed = 1,
    CaptchaRequired = 2,
    AuthFailed = 3,
    MakeRedirect = 4,
    Reload = 5,
    MobileActivationRequired = 6 | 11 | 12,
    Message = 7,
    Failed = 8,
    VotesPayment = 9,
    ZeroZone = 10,
    EvalCode = 13,
    OTP = 14,
    PasswordValidationRequired = 15
}

interface AudioExceptionOptions {
    message: string;
    kind: AudioRejectKind,
    payload?: any;
}

export default class AudioException extends LibraryException {
    public kind: AudioRejectKind;
    public payload: any;

    constructor(options: AudioExceptionOptions) {
        super(options.message);

        this.kind = options.kind;
        this.payload = options.payload;
    }

    public toString() {
        return `${this.name}: Code №${this.kind} -> ${this.message}`
    }

    public static getRejectKindByCode(code: number): AudioRejectKind | undefined {
        if (code == 0) return;

        switch (code) {
            case 1: return AudioRejectKind.EmailNotConfirmed;
            case 2: return AudioRejectKind.CaptchaRequired;
            case 3: return AudioRejectKind.AuthFailed;
            case 4: return AudioRejectKind.MakeRedirect;
            case 5: return AudioRejectKind.Reload;
            case 6:
            case 11:
            case 12:
                return AudioRejectKind.MobileActivationRequired;
            case 7: return AudioRejectKind.Message;
            case 8: return AudioRejectKind.Failed;
            case 9: return AudioRejectKind.VotesPayment;
            case 10: return AudioRejectKind.ZeroZone;
            case 13: return AudioRejectKind.EvalCode;
            case 14: return AudioRejectKind.OTP;
            case 15: return AudioRejectKind.PasswordValidationRequired;
            default: {
                if (code >= -1 && code <= -3)
                    return AudioRejectKind.Failed;
            }
        }
    }
}