import LibraryException from "./library_exception";

export enum FileErrorCode {
    NotFound, NotLoaded,
    FormatError, TransformError, Unknown
}

interface FileExceptionOptions {
    message: string;
    path?: string;
    code?: FileErrorCode;
}

export default class FileException extends LibraryException {
    public filePath?: string;
    public code: FileErrorCode;
    public constructor(options: FileExceptionOptions) {
        super(options.message);

        this.filePath = options.path;
        this.code = options.code || FileErrorCode.Unknown;
    }
}