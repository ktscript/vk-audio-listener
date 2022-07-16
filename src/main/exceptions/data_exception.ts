export enum ILADataFlag {
    ACCOUNTS = 1 << 1,
    ANTICAPTCHA = 1 << 2,
    PROXIES = 1 << 3,
    TASKS = 1 << 4,
    SYSTEM_PROXY = 1 << 5,
    BOT_SETTINGS = 1 << 6
}

export enum ILADataErrorCode {
    NOT_ENOUGH = 1,
    FAILED = 2
}

export default class ILADataException extends Error {
    public constructor(
        public message: string,
        public code: ILADataErrorCode,
        public flag: ILADataFlag | number
    ) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
    }

    [Symbol.toStringTag]() {
        return "ILADataException";
    }

    public toString() {
        return `Code #${this.code}:> ${this.message} (required: ${this.flag})`;
    }
}