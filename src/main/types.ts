import { IProxyData } from "./net";
import { ILAScriptJSON } from "./script";
import { IPlaylistContentInfo } from "./vk/base/audio";

export interface IAgentData {
    /**
     *  The value of navigator.appName
     */
    appName: string;
    /**
     *  The value of navigator.connection
     */
    connection?: IAgentConnection | undefined;
    /**
     *  The value of navigator.cpuClass
     */
    cpuClass?: string | undefined;
    /**
     * One of desktop, mobile, or tablet depending on the type of device
     */
    deviceCategory?: string | undefined;
    /**
     *  The value of navigator.oscpu
     */
    oscpu?: string | undefined;
    /**
     * The value of navigator.platform
     */
    platform: string;
    /**
     * The value of navigator.plugins.length
     */
    pluginsLength: number;
    /**
     *  The value of screen.height
     */
    screenHeight: number;
    /**
     * The value of screen.width
     */
    screenWidth: number;
    /**
     * The value of navigator.vendor
     */
    vendor: string;
    /**
     * The value of navigator.userAgent
     */
    userAgent: string;
    /**
     * The value of window.innerHeight
     */
    viewportHeight: number;
    /**
     * The value of window.innerWidth
     */
    viewportWidth: number;
}

interface IAgentConnection {
    downlink?: number | undefined;
    downlinkMax?: any;
    effectiveType?: string | undefined;
    rtt?: number | undefined;
    type?: string | undefined;
}

export interface ILAState {
    listenerStatus: boolean;
    webhookStatus: boolean;

    isFirstLaunch: boolean;
    lastValidationTime: number;
}

export interface ICache {
    tasksHistory: IListenTask[];
    tasks: IListenTask[];
    state: ILAState;
    scripts: ILAScriptJSON[];
}

export const createEmptyCache = (): ICache => {
    return {
        scripts: [],
        tasks: [],
        tasksHistory: [],
        state: {
            listenerStatus: false,
            webhookStatus: false,

            isFirstLaunch: true,
            lastValidationTime: -1
        }
    }
}

export const normalizeCache = (cache: ICache): ICache => {
    const empty = createEmptyCache();
    return {
        ...empty,
        ...cache,
        state: {
            ...empty.state,
            ...cache.state
        }
    }
}

export interface IVKAccountSession {
    cookies?: Partial<ISessionCookie>;
    proxy?: IProxyData;
    agent?: IAgentData;
    user?: IUserInfo;
    authorized?: boolean;
    valid: boolean;
}

export interface IVKAccountJSON {
    login: string;
    password: string;
    session?: IVKAccountSession;
}

export type IVKPureAccount = Omit<IVKAccountJSON, 'session' | 'valid'>;

export interface ILASettings {
    vk: IVKSettings;
    bot: IBotSettings;
    app: IAppSettings;
}

export interface IVKSettings {
    authorization: IAuthorizationSettings;
    listener: IListenerSettings;
}

interface IAuthorizationSettings {
    autostart: boolean;
}

interface IListenerSettings {
    taskHistoryCapacity: number;
}

interface IBotSettings {
    token?: string;
    password?: string;
    user?: IBotUser;
}

interface IBotUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name: string;
    username: string;
    language_code: string;
}

export interface IAppSettings {
    antiCaptchaKey?: string;
    proxy?: IProxyData;
    webhookPort: number;
}

export const createDefaultSettings = (): ILASettings => {
    return {
        vk: {
            authorization: {
                autostart: false
            },
            listener: {
                taskHistoryCapacity: 20
            },
        },
        bot: {},
        app: { webhookPort: 3481 },
    }
}

export const normalizeSettings = (data: ILASettings): ILASettings => {
    return {
        ...createDefaultSettings(),
        ...data
    }
}

type SetCookieHeaders = string[];

export interface ISessionCookie {
    mail?: SetCookieHeaders;
    base: SetCookieHeaders;
    login: SetCookieHeaders;
}

export interface IUserInfo {
    access?: boolean;
    publicAccess: string;
    profileState: string;
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
}

export interface AudioAdsOptions {
    duration: number;
    content_id: string;
    puid22: number;
    account_age_type: number;
    _SITEID: number;
    vk_id: number;
    ver: number
}

export interface VKAudioAdsConfig {
    enabled: boolean;
    sections: string[];
    day_limit_reached: boolean;
    sign: string;
}

export interface VKBrowserData {
    ads_rotate_interval, al, id, sex, lang: number;
    intnat: boolean;
    host, loginDomain: string;
    statsMeta: {
        platform: string;
        st: boolean;
        time: number;
        hash: string
    };
    loaderNavSection: string;
    rtl, version, stDomains: number;
    stDomain: string;
    navPostfix: string;
    wsTransport: string;
    stExcludedMasks: string[];
    zero: boolean;
    contlen: number;
    loginscheme: string;
    ip_h: string;
    navPrefix: string;
    dt, fs, ts, tz, pd: number;
    vcost: number;
    time: number[];
    sampleUser: number; spentLastSendTS: any;
    a11y: number;
    statusExportHash: string;
    audioAdsConfig: VKAudioAdsConfig;
    longViewTestGroup: null;
    cma: number;
    lpConfig: {
        enabled: number;
        key: string;
        ts: number;
        url: string;
        lpstat: number;
        sseUrl: string;
    };
    pr_tpl: string;
    push_hash: string;
    audioInlinePlayerTpl: string;
    pe: object;
    ex: any[];
    countryISO: string;
    apiConfigDomains: {
        apiDomain: string;
        loginDomain: string;
    };
    isCallsDevEnv: string;
}

export interface IListenTask {
    id: string;

    enabled: boolean;
    performed: boolean;
    human: boolean;
    favorite: boolean;
    deleted: boolean;

    timeLeft: number;
    progress: ITaskProgress;
    playlist: IPlaylistContentInfo;
}

interface ITaskProgress {
    initial: number;
    actual: number;
    target: number;
}

export enum ILANotificationCode {
    AUTHORIZATION_ALREADY_LAUNCHED = 1,
    LISTENER_ALREADY_LAUNCHED,
    NEED_AUTHORIZATION,
    PROXY_VALIDATION_START,
    PROXY_VALIDATION_STOP,
    ACCOUNTS_VALIDATION_START,
    ACCOUNTS_VALIDATION_STOP,
    ACCOUNTS_PROXY_VALIDATION_START,
    ACCOUNTS_PROXY_VALIDATION_STOP,
    CONNECTION_CHECK_START,
    CONNECTION_CHECK_END,
    SCRIPT_EXECUTE_ERROR,
    DATA_REQUIRED,

    AUTHORIZATION_START,
    AUTHORIZATION_COMPLETE,
    AUTHORIZATION_NOT_REQUIRED,

    LISTENER_START,
    LISTENER_STOP,
    LISTENER_TASK_COMPLETED,
}

export class ILANotification {
    public constructor(
        public code: ILANotificationCode,
        public payload?: any
    ) { }

    public toString() {
        return `Code #${this.code}`
    }
}