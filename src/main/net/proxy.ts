import ProxyAgent from "proxy-agent"
import ProxyException from "../exceptions/proxy_exception";

interface ProxyAuth {
    username: string;
    password: string;
}

export interface IProxyData {
    type: ProxyType;
    address: string;
    port: number;
    auth?: ProxyAuth;
    valid?: boolean;
}

// const PATTERN_MATCH_PROXY = /?(?:(\S+):(\S+)[@:])?:(\d{2,5})/i;
const HTTP_PATTERN = /(?:.*\:\/\/)/i;

export type ProxyType = "http" | "socks";

export default class ILAProxy implements IProxyData {
    public valid: boolean;
    public type: ProxyType;
    public address: string;
    public port: number;
    public auth?: ProxyAuth;

    public constructor(options: IProxyData) {
        this.type = options.type;
        this.port = options.port;
        this.auth = options.auth;
        this.address = options.address;
        this.valid = options.valid || true;
    }

    public getAgent() {
        return ILAProxy.getAgentFrom(this);
    }

    public toJSON() {
        return ILAProxy.getProxyData(this);
    }

    public toString() {
        return ILAProxy.stringify(this);
    }

    public static getAgentFrom(proxy: IProxyData) {
        const string = ILAProxy.stringify(proxy);
        const agent = new ProxyAgent(string);

        return agent;
    }

    public static stringify(proxy: IProxyData) {
        let { auth, type, port, address } = proxy;
        let authString = auth ? `${auth.username}:${auth.password}@` : "";
        return `${type}://${authString}${address}:${port}`;
    }

    public static getProxyData(proxy: IProxyData) {
        return {
            type: proxy.type,
            address: proxy.address,
            port: proxy.port,
            auth: proxy.auth,
            valid: proxy.valid
        }
    }

    public static fromString(type: ProxyType, data: string): ILAProxy {
        data = data.replace(HTTP_PATTERN, "").trim();
        if (data.length < 2) throw new ProxyException("Incorrect type of the proxy", data);

        const parts = data.split(":")
        let address, port, username, password;

        if (parts.length == 3) {
            const [some] = parts.splice(1, 1);
            [username, port] = parts;
            [password, address] = some.split("@");
        } else
            [address, port, username, password] = parts;

        return new ILAProxy({
            type, address,
            port: parseInt(port),
            auth: (username && password) ? { username, password } : undefined
        });
    }

    public static from(proxy: IProxyData) {
        return new ILAProxy(proxy);
    }
}

// interface ProxyValidatorFunctionOptions {
//     startOffset?: number;
//     testUrl: string | URL;
// }

// export function proxyValidatorDecorator(
//     proxies: ILAProxy[],
//     options: ProxyValidatorFunctionOptions
// ) {
//     let url = options.testUrl.toString();
//     let index = options.startOffset || 0;

//     return async function getValidProxy(): Promise<ILAProxy> {
//         let valid = await checkProxy(proxies[index], url);
//         let validProxy = proxies[index];

//         index = (index + 1) % proxies.length;

//         return !valid ? getValidProxy() : validProxy;
//     }
// }

// export async function checkProxy(proxy: IProxyData, testUrl: string) {
//     const start = Date.now();
//     const object = { status: false, time: 0 };

//     try {
//         const url = testUrl;
//         await axios.get(url, {
//             timeout: 5000,
//             httpsAgent: ILAProxy.getAgentFrom(proxy)
//         });

//         object.status = true;
//     } catch (error) {
//         object.status = false;
//     }

//     const delta = Date.now() - start;
//     object.time = delta;

//     return object;
// }