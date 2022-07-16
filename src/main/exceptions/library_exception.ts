export default class LibraryException extends Error {
    public message: string;

    public constructor(message: string) {
        super(message);
        this.name = this.getName();
        this.message = message;
        Error.captureStackTrace(this, this.constructor);
    }

    protected getName() {
        return this.constructor.name;
    }

    public [Symbol.toStringTag]() {
        return this.getName();
    }

    public toString() {
        return `${this.name} -> ${this.message}`
    }
}