import { createHash } from "crypto";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { FileException } from "../exceptions";
import { FileErrorCode } from "../exceptions/file_exception";

type TransformFunction<T = any, K = any> = (data: T) => Promise<K> | K;
type ValidateFunction<T = any> = (data: T) => Promise<boolean> | boolean;

interface FileStorageOptions<K> {
    path: string;
    validateInput?: ValidateFunction<string>;
    transformInput: TransformFunction<any, K>;
    transformOutput: TransformFunction<K, any>;
}

export default class FileStorage<T> {
    public data!: T;

    public constructor(private options: FileStorageOptions<T>) { }

    public get path() {
        return this.options.path;
    }

    public get transform() {
        return this.options.transformInput;
    }

    public get validateInput() {
        return this.options.validateInput;
    }

    public async read() {
        const { path, transformInput, validateInput } = this.options;

        if (!existsSync(path)) throw new FileException({
            message: "File is't found",
            code: FileErrorCode.NotFound,
            path
        });


        const content = await readFile(path, { encoding: "utf-8" });

        if (content.length != 0 && validateInput) {
            let result = await validateInput(content);
            if (!result) throw new FileException({
                message: `Incorrect format of the file '${path}'`,
                code: FileErrorCode.FormatError,
                path
            });
        }

        let transformResult = await transformInput(content);

        if (transformResult == undefined) throw new FileException({
            message: "The transformInput function should return data",
            code: FileErrorCode.TransformError,
            path
        });

        return this.data = transformResult;
    }

    public async save() {
        let { path, transformOutput } = this.options;
        let transformResult = await transformOutput(this.data);
        if (transformResult == undefined) throw new FileException({
            message: "The transformOutput function should return data",
            code: FileErrorCode.TransformError,
            path
        });
        
        return writeFile(path, transformResult, { encoding: "utf-8" });
    }

    public getFileHash() {
        let hash = createHash("sha256");

        if (!this.data)
            throw new FileException({
                message: "Unable to get the hash of the file. You need to load the data.",
                path: this.options.path
            });

        let data: any = this.data;
        switch (typeof this.data) {
            case "object":
                data = JSON.stringify(data);
                break;
            default: {
                data = data?.toString();
            }
        }

        hash.update(data);
        return hash.digest("hex");
    }
}