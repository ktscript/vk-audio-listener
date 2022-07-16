import { AudioAdsOptions } from "@main/types";

interface AudioAdSettings {
    preroll?: {
        maxBannerShow: number;
        connectionTimeout: number;
    };
}

interface AudioAdSections {
    preroll: (AdBannerAdditionalData | AdBannerStatistics | AdBannerAudio)[]
}

interface AudioAdBanner {
    bannerID: string | number;
    type: AudioAdBannerType;
    statistics: StatisticsData[]
}

interface StatisticsData {
    url: string;
    type: string;
    thresholdPValue?: number;
    pvalue?: number;
    value?: number;
}

interface AdBannerAdditionalData extends AudioAdBanner {
    type: "additionalData";
    allowClose: boolean;
    allowCloseDelay: number;
    url: string;
    serviceStatistics: StatisticsData[];
}

interface AdBannerStatistics extends AudioAdBanner {
    type: "statistics";
    width: string | number;
    height: string | number;
    duration: number;
}

interface AdBannerAudio extends AudioAdBanner {
    type: "audio";
    duration: number;
    bitrate: number;
    src: string;
    allowSeek, allowSkip, allowTrackChange, allowVolumeChange: boolean;
    minVolume: number;
    mediafiles: AdMediaFiles[];
    companionAds: any;
}

interface AdMediaFiles {
    bitrate: number;
    src: string;
}

interface IAudioArtist {
    id: string;
    name: string;
}

export interface IAudioHashes {
    addHash: string;
    editHash: string;
    actionHash: string;
    deleteHash: string;
    replaceHash: string;
    urlHash: string;
    restoreHash: string;
}

export enum AudioContext {
    MY = "my",
    ATTACH = "attach",
    MODULE = "module",
    PODCAST = "podcast",
    USER_LIST = "user_list",
    GROUP_LIST = "group_list",
    ALBUM_PAGE = "album_page",
    RECOMS_RECOMS = "recoms_recoms",
    EDIT_PLAYLIST = "edit_playlist",
    ATTACH_PREVIEW = "attach_preview",
    RECOMS_RECENT_AUDIOS = "recoms_recent_audios"
}

export enum AudioStopReason {
    NEW = "new",
    PREVIOS = "prev",
    STOP_BUTTON = "stop_btn",
    NEXT_BUTTON = "next_btn",
    PLAYLIST_NEXT = "playlist_next",
    PLAYLIST_CHANGE = "playlist_change"
}

export type AudioAdBannerType = "audio" | "additionalData" | "statistics";

export interface AudioAdResponse {
    settings: AudioAdSettings;
    sections: AudioAdSections;
}

export interface IListenedData {
    state: "app" | "background";
    context: AudioContext,
    playlist_id: string;
    prev: string;
    end_stream_reason: AudioStopReason;
    listened: number;
}

export interface IAudioInfo {
    ownerId: string;
    id: string;
}

export interface IPlaylistMeta {
    id: number;
    ownerId: number;
    accessHash?: string;
}

export interface IAudio {
    id: number;
    ownerId: number;
    fullId: string;
    url: string;
    title: string;
    perfomer: string;
    duration: number;
    albumId: number;
    authorLink: string;
    lyrics: number;
    flags: number;
    context: string;
    extra: string;
    hashes: IAudioHashes;
    coverUrls: string[];
    ads: AudioAdsOptions;
    subtitle: string;
    mainArtists: IAudioArtist[] | string;
    feetArtists: IAudioArtist[] | string;
    album: any[];
    trackCode: string;
    restriction: number;
    albumPart: number;
    accessKey: string;
    chartInfo: boolean;
    canEdit: boolean;
    canDelete: boolean;
}


export interface IPlaylistContentInfo {
    id: number;
    title: string;
    ownerId: number;
    fullId: string;
    audioList: IAudio[];
    permissions: object;
    totalCount, listens, lastUpdated: number;
    authorHref, authorName, description: string;
    editHash, followHash, accessHash: string;
    isBlocked, isFollowed, isGeneratedPlaylist, isOfficial: boolean;
}