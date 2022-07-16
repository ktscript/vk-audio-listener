import {
    randomMobileUserAgent,
    PROXY_CONNECTION_TIMEOUT,
    VK_BASE_URL
} from "@main/utils";
import { sleep } from "@utils/helpers";
import { Logger } from "@utils/logger";
import { createFetchTimeout, ILAProxy, IProxyData } from ".";

const logger = new Logger({ module: "connection-checker" });

const PROXY_CHUNKS = 6;
const PROXY_CHUNKS_DELAY = 150;

interface IProxyConnectionCheckResponse {
    proxy?: IProxyData;
    time: number;
    status: boolean;
}

export const checkConnection = async (proxy?: ILAProxy) => {
    const fetchTimeout = createFetchTimeout(PROXY_CONNECTION_TIMEOUT);
    const { userAgent } = randomMobileUserAgent();
    const fetchOptions: any = {
        method: "GET",
        headers: { "user-agent": userAgent }
    }
    const agent = proxy?.getAgent();
    if (agent) fetchOptions.agent = agent;
    let valid = false;
    try {
        const proxyString = proxy ? proxy?.toString() : "";
        logger.log("Checking connection.", proxyString)
        await fetchTimeout(VK_BASE_URL, fetchOptions);
        valid = true;
    } catch (error) {
        valid = false;
    }

    if (proxy) proxy.valid = valid;
    return valid;
}

export const checkConnectionResponseTime = async (proxy?: ILAProxy): Promise<IProxyConnectionCheckResponse> => {
    const start = Date.now();
    const status = await checkConnection(proxy);
    const end = Date.now() - start;
    return {
        proxy: proxy?.toJSON(),
        time: end,
        status
    }
}

export const checkProxies = async (proxies: ILAProxy[]) => {
    let invalid = 0;
    let chunkOffset = 0;
    let chunks = Math.ceil(proxies.length / PROXY_CHUNKS);
    const results: IProxyConnectionCheckResponse[] = [];
    while (chunkOffset < chunks) {
        const currentOffset = chunkOffset++ * PROXY_CHUNKS;
        const chunk = proxies.slice(currentOffset, currentOffset + PROXY_CHUNKS);
        const promises = chunk.map(async proxy => {
            const result = await checkConnectionResponseTime(proxy);
            if (!result.status) invalid++;
            results.push(result);
        })

        logger.log("Checking proxy chunks (%i / %i)", chunkOffset, chunks);
        await Promise.all(promises);
        await sleep(PROXY_CHUNKS_DELAY);
    }

    return {
        invalidCount: invalid,
        successCount: results.length - invalid,
        proxies: results,
    };
}