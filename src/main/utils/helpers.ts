import crypto from "crypto";
import UserAgent from "user-agents"
import { IVKPureAccount } from "@main/types";
import { fetch, ILAProxy, ProxyType } from "@main/net";
import { RequestInit } from "node-fetch";
import { existsSync, mkdirSync } from "fs";
import { ILA_RESOURCES_PATH } from "@utils/constants";

export const normalizeJson = (jsObject = {}) => JSON.parse(eval(`JSON.stringify(${jsObject})`));
const PLAYLIST_URL_PATTERN = /vk\.com.+(?:audio_playlist|\/)(-?\d+)_(\d+)(?:(?:%2F|.|.+access_hash=)([a-z0-9]{18}))?/i;

export const initResourceFolderSync = () => {
    if (!existsSync(ILA_RESOURCES_PATH)) {
        mkdirSync(ILA_RESOURCES_PATH);
    }
}

export const setConsoleTitle = (title: string) => {
    process.stdout.write(
        String.fromCharCode(27) + ']0;' + title + String.fromCharCode(7)
    );
}

export const fetchImageAsBase64 = async (imageUrl: string) => {
    const response = await fetch(imageUrl);
    const arraybuffer = await response.arrayBuffer();
    return Buffer.from(arraybuffer).toString("base64");
}

export function base64ArrayBuffer(arrayBuffer) {
    let base64 = ''
    let encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

    let bytes = new Uint8Array(arrayBuffer)
    let byteLength = bytes.byteLength
    let byteRemainder = byteLength % 3
    let mainLength = byteLength - byteRemainder

    let a, b, c, d
    let chunk

    // Main loop deals with bytes in chunks of 3
    for (var i = 0; i < mainLength; i = i + 3) {
        // Combine the three bytes into a single integer
        chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

        // Use bitmasks to extract 6-bit segments from the triplet
        a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
        b = (chunk & 258048) >> 12 // 258048   = (2^6 - 1) << 12
        c = (chunk & 4032) >> 6 // 4032     = (2^6 - 1) << 6
        d = chunk & 63               // 63       = 2^6 - 1

        // Convert the raw binary segments to the appropriate ASCII encoding
        base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder == 1) {
        chunk = bytes[mainLength]

        a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

        // Set the 4 least significant bits to zero
        b = (chunk & 3) << 4 // 3   = 2^2 - 1

        base64 += encodings[a] + encodings[b] + '=='
    } else if (byteRemainder == 2) {
        chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]

        a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
        b = (chunk & 1008) >> 4 // 1008  = (2^6 - 1) << 4

        // Set the 2 least significant bits to zero
        c = (chunk & 15) << 2 // 15    = 2^4 - 1

        base64 += encodings[a] + encodings[b] + encodings[c] + '='
    }

    return base64
}

export const getRandomScreen = () => {
    let ar = 16 / 9;
    let min = 480;
    let ex = min / 16 * 4;
    let height = min + ex * (Math.random() * 10 ^ 0);
    let width = Math.floor(ar * height);

    return { width, height }
}

export const getRandomString = (size: number = 8) => {
    let o = "";
    for (let i = 0; i < size; i++) {
        let r = Math.floor(Math.random() * 16);
        o += r.toString(16);
    }

    return o;
}

export const fillRandom = (array: any[]) => {
    const size = array.length;
    for (var t, i = 0; i < size; i++)
        0 == (3 & i) && (t = 4294967296 * Math.random()),
            array[i] = t >>> ((3 & i) << 3) & 255;
    return array
}

export const getRandomElement = (array: any[], min: number = 0, max?: number) => {
    max ??= array.length;

    let random = min + Math.random() * (max - min) ^ 0;
    return array[random];
}

export const parsePlaylistUrl = (url: string): {
    ownerId: number;
    id: number;
    accessHash?: string;
} | undefined => {
    const matchResult = url.match(PLAYLIST_URL_PATTERN);
    if (!matchResult) return undefined;
    const [, ownerId, id, accessHash] = matchResult as [any, number, number, string];

    return { ownerId, id, accessHash }
}

export const getObjectHash = (data: object) => {
    return crypto
        .createHash("sha1")
        .update(JSON.stringify(data))
        .digest("hex");
}

export const getAccountHash = (account: IVKPureAccount) => {
    return (account.login + account.password);
}

export const splitIntoChunks = <T>(array: T[], chunkSize: number): T[][] => {
    const chunks: T[][] = [];
    const chunksLength = (array.length / chunkSize)
    for (let i = 0; i < chunksLength; i++) {
        let offset = chunkSize + (i * chunkSize);
        let chunk = array.slice(i * chunkSize, offset);

        if (chunk.length == 0) break;

        chunks.push(chunk);
    }

    return chunks;
}

export const jsonTryToParse = (object: any) => {
    try {
        return JSON.parse(object);
    } catch (error) {
        return false;
    }
}

export const randomMobileUserAgent = () => {
    return new UserAgent({ deviceCategory: "mobile" }).random().data;
}

export const convertObjectKeysToLowerCase = (data?: Record<string, any>) => {
    if (!data) return {};
    const object: Record<string, any> = {};
    for (const key in data) {
        object[key.toLowerCase()] = data[key];
    }

    return object;
}


export const parseProxies = (type: ProxyType, proxies: string) => {
    const lines = proxies.split("\n");
    return lines.map(line => ILAProxy.fromString(type, line));
}

interface IIPInfo {
    status: string;
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    timezone: string;
    isp: string;
    org: string;
    as: string;
    query: string;
}

export const fetchIPInfo = async (options: RequestInit = {}): Promise<IIPInfo | undefined> => {
    try {
        const response = await fetch("http://ip-api.com/json", {
            ...options,
            method: "GET"
        });

        return await response.json() as IIPInfo;
    } catch (error) { return; }
}