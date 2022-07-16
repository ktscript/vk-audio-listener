import { AudioException } from "@main/exceptions";
import { AudioRejectKind } from "@main/exceptions/audio_exception";
import { CookieJarExtension, fetch } from "@main/net";
import ILAProxy from "@main/net/proxy";
import { normalizeJson, randomMobileUserAgent } from "@main/utils";

const AUDIO_ENUMS_PATTERN = /({AUDIO_ITEM_INDEX.+?})/i;
// const COMMON_JS_FILE_PATTERN = /src="(\S+\/bundles\/common\.[a-z0-9]+\.js)(?:\?[a-z0-9]+)/i;
const COMMON_JS_FILE_PATTERN = /(dist\/common\.[0-9a-z]+\.js)/i;
const VK_STORAGE_BASE_URL = "https://st.vk.com/";

interface IAudioParserConfig {
    proxy?: ILAProxy;
    userAgent?: string;
}

const fetchCommonJSFile = async (config?: IAudioParserConfig) => {
    // Use the VK test page because everytime it opens as a full view of the site 
    const response = await fetch("https://vk.com/test", {
        agent: config?.proxy?.getAgent(),
        headers: {
            "user-agent": config?.userAgent || randomMobileUserAgent().userAgent
        }
    });
    const html = await response.text();
    const pathMatchResult = html.match(COMMON_JS_FILE_PATTERN);
    if (!pathMatchResult) {
        throw new AudioException({
            message: "Unable to get a common.js file",
            kind: AudioRejectKind.Failed,
            payload: html
        });
    }
    const url = new URL(pathMatchResult[1], VK_STORAGE_BASE_URL);
    return fetch(url.toString()).then(response => response.text());
}

export const parseAudioEnum = async (config?: IAudioParserConfig) => {
    const commonJSFile = await fetchCommonJSFile(config);
    const audioEnumMatchResult = commonJSFile?.match(AUDIO_ENUMS_PATTERN);

    if (!audioEnumMatchResult) {
        throw new AudioException({
            message: "Unable to get the audio enum",
            kind: AudioRejectKind.Failed,
            payload: commonJSFile
        });
    }
    return normalizeJson(audioEnumMatchResult[1]);
}