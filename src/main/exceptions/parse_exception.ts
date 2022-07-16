import { VKException } from ".";

interface ParseOptions {
    message: string;
    payload?: any;
}

export class ParseException extends VKException {
    public payload?: any;

    public constructor(options: ParseOptions) {
        super(options.message);
        this.payload = options.payload;
    }
}