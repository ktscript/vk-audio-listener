import { join } from "path";

export const ILA_DEFAULT_UPDATE_SERVER = "http://109.86.98.224:3481";
export const ILA_RESOURCES_PATH = join(process.cwd(), "/ila-data");
export const ILA_LOG_DIR_PATH = join(ILA_RESOURCES_PATH, "/log");
export const ILA_BOT_DATA_PATH = join(ILA_RESOURCES_PATH, "/bot");
export const ILA_USER_DATA_PATH = join(ILA_RESOURCES_PATH, "/user");
export const ILA_CERTIFICATES_PATH = join(ILA_RESOURCES_PATH, "/certificates");
export const ILA_MANIFEST_PATH = join(process.cwd(), "ila.manifest.json");

export const DATA_STORAGE_DEFAULTS = {
    cacheFilename: "cache.json",
    accountsFilename: "accounts.json",
    proxyFilename: "proxies.json",
    settingsFilename: "settings.json"
}
