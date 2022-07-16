import cheerio from "cheerio";
import { stringify as queryStringify } from "querystring";
import { AudioException } from "@main/exceptions";
import { AudioRejectKind } from "@main/exceptions/audio_exception";
import { parseAudioEnum } from "./audio_parser";
import { CookieJarExtension, fetchCookieFollowRedirectsDecorator, ILACookieStore } from "@main/net";
import { IAgentData } from "@main/types";
import ILAProxy from "@main/net/proxy";
import { fillRandom } from "@main/utils";
import { fetchBrowserData } from "../general";
import {
    AudioStopReason, IAudio,
    IAudioHashes, IAudioInfo,
    IListenedData, IPlaylistContentInfo,
    IPlaylistMeta
} from "./types"
import { Logger } from "@utils/logger";
import AbortController from "abort-controller";
import { RequestInfo, RequestInit } from "node-fetch";

interface IVKAudioOptions {
    agent?: IAgentData;
    proxy?: ILAProxy;
    browserData?: any;
}

const logger = new Logger({ module: "audio" });

export class VKAudio {
    private static readonly CONNECTION_TIMEOUT = 15_000;
    private static readonly VK_MOBILE_AUDIO_URL = "https://m.vk.com/audio";
    private static AUDIO_ENUM: any;
    private deviceId: string;
    private fetchFollowRedirect;
    public constructor(
        private jar: CookieJarExtension,
        private options: IVKAudioOptions) {
        this.deviceId = VKAudio.getDeviceId();
        this.fetchFollowRedirect = fetchCookieFollowRedirectsDecorator(this.jar);

    }

    private fetch(url: RequestInfo, options: RequestInit = {}) {
        const { agent, proxy } = this.options;
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), VKAudio.CONNECTION_TIMEOUT);
        return this.fetchFollowRedirect(url, {
            ...options,
            agent: proxy?.getAgent(),
            signal: controller.signal,
            compress: false,
            headers: {
                origin: "https://m.vk.com/",
                referer: "https://m.vk.com/audio",
                "content-type": "application/x-www-form-urlencoded",
                "user-agent": agent?.userAgent || "",
                "x-requested-with": "XMLHttpRequest",
                ...options.headers
            }
        }).finally(() => clearTimeout(timerId));
    }

    public async addAudio(audio: IAudio, playlist: IPlaylistContentInfo) {
        if (audio.canDelete) return;

        const params = {
            _ajax: 1,
            act: "add",
            audio: audio.fullId,
            hash: audio.hashes.addHash,
            access_key: audio.accessKey,
            track_code: audio.trackCode,
            source_playlist_id: playlist.fullId
        };

        const response = await this.fetch(VKAudio.VK_MOBILE_AUDIO_URL, {
            method: "POST",
            body: queryStringify(params)
        });

        const json = await response.json();
        if (!json.data || json.data?.length == 0) return;
        const [addedFullId, deleteHash] = json.data;
        return {
            fullId: addedFullId,
            deleteHash
        }
    }

    public async startPlayback(audio: IAudio) {
        const options = {
            act: "start_playback",
            audio_id: audio.id,
            owner_id: audio.ownerId,
            hash: audio.hashes.actionHash,
            uuid: this.deviceId
        }

        const response = await this.fetch(
            VKAudio.VK_MOBILE_AUDIO_URL, {
            method: "POST",
            body: queryStringify(options)
        });

        return response.json();
    }

    public async sendQueueParams(audio: IAudio) {
        const options = {
            act: "queue_params",
            audio_id: audio.id,
            owner_id: audio.ownerId,
            hash: audio.hashes.actionHash
        }

        const response = await this.fetch(
            VKAudio.VK_MOBILE_AUDIO_URL, {
            method: "POST",
            body: queryStringify(options)
        });

        return response.json()
    }

    public async listenAudio(
        audio: IAudio,
        playlist: string,
        extListenedData: Partial<IListenedData> = {}
    ) {
        extListenedData.end_stream_reason ??= AudioStopReason.STOP_BUTTON;
        extListenedData.listened ??= 35;

        const mobileOptions = {
            _ajax: 1,
            state: "app",
            act: "playback",
            audio: audio.fullId,
            track_code: audio.trackCode,
            hash: audio.hashes.urlHash,
            playlist_id: playlist,
            ...extListenedData
        }

        const response = await this.fetch(
            VKAudio.VK_MOBILE_AUDIO_URL, {
            method: "POST",
            body: queryStringify(mobileOptions)
        });

        return response.json();
    }

    public async reloadAudios(audios: IAudio[]): Promise<IAudio[]> {
        const audioList = [...audios];
        const offset = 5;
        const start = Math.floor(Math.random() * (audios.length - offset));
        const chunk = audioList.slice(start, start + offset);
        const fullIds = chunk.map(audio => {
            const { fullId, url, hashes } = audio;
            const { actionHash, urlHash } = hashes;
            if (!url && urlHash) return `${fullId}_${actionHash}_${urlHash}`
            return undefined;
        }).filter(fullId => fullId != undefined) as string[];

        return this.fetchAudioUrls(fullIds);
    }

    protected async fetchAudioUrls(audios: string[]): Promise<IAudio[]> {
        const response = await this.fetch(
            VKAudio.VK_MOBILE_AUDIO_URL, {
            method: "POST",
            body: queryStringify({
                act: "reload_audio",
                ids: audios.join(",")
            })
        });

        const { data: [audioList] } = await response.json();
        const promises = audioList.map(this.normalizeAudioObject.bind(this));
        return Promise.all(promises) as any;
    }

    // public async fetchMyMusicPlaylistId(vkId: number) {
    //     const path = `/audios${vkId}`;
    //     const url = path + "?section=my";
    //     const stat = [
    //         "audio",
    //         Math.random() * 100 ^ 0,
    //         Math.random() * 100 ^ 0,
    //         100 + Math.random() * 900 ^ 0,
    //         100 + Math.random() * 900 ^ 0
    //     ];
    //     const params = {
    //         section: "my",
    //         _tstat: stat.join(","),
    //         _ref: path.slice(1)
    //     }
    //     const { data } = await this.fetch(url, queryStringify(params));
    //     const myPlaylistIdPattern = /AudioPlaylistRoot.+data-playlist-id="([^"]+)/;
    //     const matched = data.match(myPlaylistIdPattern);
    //     if (!matched) return;
    //     return matched[1];
    // }

    public async fetchPlaylist(playlistInfo: IPlaylistMeta) {
        const response = await this.fetch(
            VKAudio.VK_MOBILE_AUDIO_URL, {
            method: "POST",
            body: queryStringify({
                act: "load_section",
                type: "playlist",
                playlist_id: playlistInfo.id,
                owner_id: playlistInfo.ownerId,
                access_hash: playlistInfo.accessHash,
                is_loading_all: 1,
            })
        });

        const payload = await response.json();
        const { data } = payload;
        if (!Array.isArray(data)) {
            if (payload.location) {
                throw new AudioException({
                    message: "Authorization error.",
                    kind: AudioRejectKind.AuthFailed,
                    payload
                });
            }

            throw new AudioException({
                message: "Unable to load playlist content. Please, specify valid ownerId or playlistId",
                kind: AudioRejectKind.Failed,
                payload
            });
        }

        const [playlistData] = data;
        return this.normalizePlaylistObject(playlistData);
    }

    public async fetchDesktopPlaylist(playlistInfo: IPlaylistMeta) {
        const response = await this.fetch(
            "https://vk.com/al_audio.php?act=load_section", {
            method: "POST",
            body: queryStringify({
                al: 1,
                act: "load_section",
                type: "playlist",
                playlist_id: playlistInfo.id,
                owner_id: playlistInfo.ownerId,
                access_hash: playlistInfo.accessHash,
                is_loading_all: 1,
                claim: 0,
                offset: 0
            })
        });

        const data = await response.json();
        const { data: [playlistData] } = this.processResponse(data);

        if (!playlistData) {
            throw new AudioException({
                message: "Unable to load playlist content. Please, specify valid ownerId or playlistId",
                kind: AudioRejectKind.Failed
            });
        }

        return this.normalizePlaylistObject(playlistData);
    }

    public async fetchOwnerPlaylists(
        ownerId: number,
        offset: number = 0
    ) {
        // const { data } = await this.fetch(
        //     "https://vk.com/al_audio.php?act=owner_playlists", queryStringify({
        //         al: 1,
        //         group_id: 0,
        //         owner_id: ownerId,
        //         is_attach: 0,
        //         offset
        //     })
        // );
        // const { code, data: [items, count]} = this.processResponse(data);
        // let { data } = await this.fetch(
        //     "https://vk.com/al_audio.php?act=owner_playlists", queryStringify({
        //         al: 1,
        //         group_id: 0,
        //         owner_id: ownerId,
        //         is_attach: 0,
        //         offset
        //     })
        // );

        // let { code, data: [items, count] } = this.processResponse(data);
        // if (!items || code != 0) {
        //     throw new AudioException({
        //         message: "Unable to load playlist content. Please, specify valid ownerId or playlistId",
        //         kind: AudioRejectKind.Failed
        //     });
        // }

        // return { count, items };
    }

    public async fetchPlaylistsByAudio(audio: IAudioInfo) {
        // let { data } = await this.fetch(
        //     "/al_audio.php", queryStringify({
        //         al: 1,
        //         act: "playlists_by_audio",
        //         owner_id: 225166577, // owner id
        //         audio_owner_id: audio.ownerId,
        //         audio_id: audio.id
        //     })
        // );

        // return this.processResponse(data);
    }

    // private handleFetchAudioError(error: Error, audiosChunk: any[]) {
    //     if (error instanceof AudioException) {
    //         let [errorMessage] = error.payload;

    //         switch (errorMessage) {
    //             case "bad_hash": {
    //                 return this.fetchAudios(audiosChunk).then(items => {
    //                     let fullIds = items.map(audio => audio.fullId);

    //                     return this.fetchAudioUrls(fullIds);
    //                 });
    //             }

    //             case "no_audios": throw error;
    //         }
    //     }

    //     throw error;
    // }

    // protected async fetchAudios(audios: string[]): Promise<IAudio[]> {
    //     // TODO: rewrite this method
    //     let { data } = await this.fetch(
    //         "https://vk.com/al_audio.php", queryStringify({
    //             al: 1,
    //             act: "reload_audios",
    //             audio_ids: audios.join(",")
    //         })
    //     );

    //     let { data: [audioList] } = this.processResponse(data);

    //     return Promise.all(audioList.map(this.normalizeAudioObject.bind(this)));
    // }

    protected processResponse(response: any) {
        if (!response.payload) throw new AudioException({
            message: "Cannot get a payload data",
            kind: AudioRejectKind.Failed
        });

        let [code, data] = response.payload;

        code = Number(code);
        data = VKAudio.normalizeResponse(data);

        const kind = AudioException.getRejectKindByCode(code);

        if (kind) throw new AudioException({
            message: `Catched error #${code}`,
            payload: data,
            kind
        });

        return { code, data };
    }

    private static normalizeResponse(payload: any) {
        if (!Array.isArray(payload)) return payload;

        return payload.map(data => (typeof data == "string" && data.slice(-1) == '"') ? data.slice(1, -1) : data);
    }

    private async normalizeAudioObject(audio: any[]): Promise<IAudio> {
        const {
            AUDIO_ITEM_INDEX_ID, AUDIO_ITEM_INDEX_OWNER_ID,
            AUDIO_ITEM_INDEX_URL, AUDIO_ITEM_INDEX_TITLE,
            AUDIO_ITEM_INDEX_PERFORMER, AUDIO_ITEM_INDEX_DURATION,
            AUDIO_ITEM_INDEX_ALBUM_ID, AUDIO_ITEM_INDEX_AUTHOR_LINK,
            AUDIO_ITEM_INDEX_LYRICS, AUDIO_ITEM_INDEX_FLAGS,
            AUDIO_ITEM_INDEX_CONTEXT, AUDIO_ITEM_INDEX_EXTRA,
            AUDIO_ITEM_INDEX_HASHES, AUDIO_ITEM_INDEX_COVER_URL,
            AUDIO_ITEM_INDEX_ADS, AUDIO_ITEM_INDEX_SUBTITLE,
            AUDIO_ITEM_INDEX_MAIN_ARTISTS, AUDIO_ITEM_INDEX_FEAT_ARTISTS,
            AUDIO_ITEM_INDEX_ALBUM, AUDIO_ITEM_INDEX_TRACK_CODE,
            AUDIO_ITEM_INDEX_RESTRICTION, AUDIO_ITEM_INDEX_ALBUM_PART,
            AUDIO_ITEM_ACCESS_KEY, AUDIO_ITEM_CHART_INFO_INDEX,
        } = await this.getAudioEnum();


        let [addHash, editHash, actionHash, deleteHash, replaceHash, urlHash, restoreHash] = audio[AUDIO_ITEM_INDEX_HASHES].split("/");
        let hashes: IAudioHashes = { addHash, editHash, actionHash, deleteHash, replaceHash, urlHash, restoreHash }
        let coverUrls = audio[AUDIO_ITEM_INDEX_COVER_URL].split(",");

        return {
            id: audio[AUDIO_ITEM_INDEX_ID],
            ownerId: audio[AUDIO_ITEM_INDEX_OWNER_ID],
            fullId: `${audio[AUDIO_ITEM_INDEX_OWNER_ID]}_${audio[AUDIO_ITEM_INDEX_ID]}`,
            url: audio[AUDIO_ITEM_INDEX_URL],
            title: audio[AUDIO_ITEM_INDEX_TITLE],
            perfomer: audio[AUDIO_ITEM_INDEX_PERFORMER],
            duration: audio[AUDIO_ITEM_INDEX_DURATION],
            albumId: audio[AUDIO_ITEM_INDEX_ALBUM_ID],
            authorLink: audio[AUDIO_ITEM_INDEX_AUTHOR_LINK],
            lyrics: audio[AUDIO_ITEM_INDEX_LYRICS],
            flags: audio[AUDIO_ITEM_INDEX_FLAGS],
            context: audio[AUDIO_ITEM_INDEX_CONTEXT],
            extra: audio[AUDIO_ITEM_INDEX_EXTRA], hashes, coverUrls,
            ads: audio[AUDIO_ITEM_INDEX_ADS],
            subtitle: audio[AUDIO_ITEM_INDEX_SUBTITLE],
            mainArtists: audio[AUDIO_ITEM_INDEX_MAIN_ARTISTS],
            feetArtists: audio[AUDIO_ITEM_INDEX_FEAT_ARTISTS],
            album: audio[AUDIO_ITEM_INDEX_ALBUM],
            trackCode: audio[AUDIO_ITEM_INDEX_TRACK_CODE],
            restriction: audio[AUDIO_ITEM_INDEX_RESTRICTION],
            albumPart: audio[AUDIO_ITEM_INDEX_ALBUM_PART],
            accessKey: audio[AUDIO_ITEM_ACCESS_KEY],
            chartInfo: audio[AUDIO_ITEM_CHART_INFO_INDEX],
            canEdit: Boolean(editHash),
            canDelete: Boolean(deleteHash)
        }
    }

    private async normalizePlaylistObject(playlistContent: any): Promise<IPlaylistContentInfo> {
        if (!playlistContent) throw new AudioException({
            message: "Unable to get playlist content",
            kind: AudioRejectKind.Failed
        });

        await this.getAudioEnum();
        const prefixAccessHash = playlistContent.accessHash ? `_${playlistContent.accessHash}` : "";
        const fullId = `${playlistContent.ownerId}_${playlistContent.id}${prefixAccessHash}`;

        const audioList: any = await Promise.all(
            playlistContent.list.map(
                array => this.normalizeAudioObject(array)
            )
        );

        return {
            id: playlistContent.id,
            title: playlistContent.title,
            ownerId: playlistContent.ownerId,
            fullId,
            authorName: parseAuthorName(playlistContent.authorName || "Unknown"),
            accessHash: playlistContent.accessHash,
            authorHref: playlistContent.authorHref,
            audioList: audioList,
            description: playlistContent.description,
            editHash: playlistContent.editHash,
            followHash: playlistContent.followHash,
            isBlocked: playlistContent.isBlocked,
            isFollowed: playlistContent.isFollowed,
            isGeneratedPlaylist: playlistContent.is_generated_playlist,
            isOfficial: playlistContent.isOfficial,
            lastUpdated: playlistContent.lastUpdated,
            listens: Number(playlistContent.listens),
            permissions: playlistContent.permissions,
            totalCount: playlistContent.totalCount
        };
    }

    private async getAudioEnum() {
        if (!VKAudio.AUDIO_ENUM) {
            const proxy = this.options.proxy;
            const userAgent = this.options.agent!.userAgent;

            VKAudio.AUDIO_ENUM = await parseAudioEnum({ proxy, userAgent });
        }

        return VKAudio.AUDIO_ENUM;
    }

    private static getDeviceId() {
        const array = new Array<number>(16);
        fillRandom(array);

        array[6] = 15 & array[6] | 64;
        array[8] = 63 & array[8] | 128;

        return createDeviceId(array);
    }
}

function createDeviceId(input: any[]) {
    const random = new Array();

    for (let o = 0; o < 256; ++o)
        random[o] = (o + 256).toString(16).substr(1);

    let offset = 0;
    return [
        random[input[offset++]], random[input[offset++]], random[input[offset++]], random[input[offset++]], "-",
        random[input[offset++]], random[input[offset++]], "-",
        random[input[offset++]], random[input[offset++]], "-",
        random[input[offset++]], random[input[offset++]], "-",
        random[input[offset++]], random[input[offset++]],
        random[input[offset++]], random[input[offset++]], random[input[offset++]], random[input[offset++]]
    ].join("");
}

export const parseAuthorName = (text: string) => {
    let $ = cheerio.load(text);
    return $.root().text();
}

export const getPlaylistFullId = (playlist: IPlaylistMeta | string) => {
    if (typeof playlist == "string") return playlist;
    const hasAccessHash = Boolean(playlist.accessHash);
    const accessHash = (hasAccessHash ? `_${playlist.accessHash}` : "");
    return `${playlist.ownerId}_${playlist.id}` + accessHash;

}
export * from "./types"