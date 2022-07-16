import ILAProxy from "../net/proxy";
import LibraryException from "./library_exception";

export default class ProxyException extends LibraryException {
    public constructor(message: string, public proxy?: ILAProxy | string) {
        super(message);
    }
}