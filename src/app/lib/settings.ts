export type ThemeMode = "light" | "dark" | "system";
export type SyncProvider = "github" | "gitlab" | "gitee" | "webdav";
export type SyncStrategy = "manual" | "on-change" | "startup";
export type SyncScopeKey = "connections" | "keys" | "keywordHighlight" | "macros" | "keyboard" | "snippets";

export interface TerminalTheme {
  id: string;
  name: string;
  bg: string;
  fg: string;
  accent: string;
}

export interface SyncSettings {
  enabled: boolean;
  provider: SyncProvider;
  token: string;
  fragment: string;
  strategy: SyncStrategy;
  scope: Record<SyncScopeKey, boolean>;
  lastSyncedAt?: string | null;
}

export interface AppSettings {
  themeMode: ThemeMode;
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalTheme: string;
  compactMode: boolean;
  largeRadius: boolean;
  confirmClose: boolean;
  autoReconnect: boolean;
  keepAlive: boolean;
  keepAliveInterval: number;
  sync: SyncSettings;
}

export const fontOptions = ["JetBrains Mono", "Fira Code", "Cascadia Code", "Hack", "IBM Plex Mono", "Source Code Pro"];
export const syncProviders: SyncProvider[] = ["github", "gitlab", "gitee", "webdav"];
export const syncStrategies: SyncStrategy[] = ["manual", "on-change", "startup"];
const allSyncScopeItems: SyncScopeKey[] = ["connections", "keys", "keywordHighlight", "macros", "keyboard", "snippets"];
// Future scopes stay hidden until the matching terminal features exist.
export const syncScopeItems: SyncScopeKey[] = ["connections", "keys"];

export const terminalThemes: TerminalTheme[] = [
  { id: "default", name: "Midnight", bg: "#15171d", fg: "#e2e8f0", accent: "#34d399" },
  { id: "nord", name: "Nord", bg: "#2e3440", fg: "#eceff4", accent: "#88c0d0" },
  { id: "dracula", name: "Dracula", bg: "#282a36", fg: "#f8f8f2", accent: "#bd93f9" },
  { id: "gruvbox", name: "Gruvbox", bg: "#282828", fg: "#ebdbb2", accent: "#b8bb26" },
  { id: "solarized", name: "Solarized", bg: "#002b36", fg: "#839496", accent: "#268bd2" },
  { id: "catppuccin", name: "Catppuccin", bg: "#1e1e2e", fg: "#cdd6f4", accent: "#cba6f7" },
];

export const defaultAppSettings: AppSettings = {
  themeMode: "system",
  terminalFontFamily: "JetBrains Mono",
  terminalFontSize: 13,
  terminalTheme: "default",
  compactMode: false,
  largeRadius: true,
  confirmClose: true,
  autoReconnect: true,
  keepAlive: true,
  keepAliveInterval: 60,
  sync: {
    enabled: false,
    provider: "gitee",
    token: "",
    fragment: "sshcr-sync",
    strategy: "on-change",
    scope: {
      connections: true,
      keys: true,
      keywordHighlight: false,
      macros: false,
      keyboard: false,
      snippets: false,
    },
    lastSyncedAt: null,
  },
};

const STORAGE_KEY = "sshcr.appSettings";

export function getTerminalTheme(id: string) {
  return terminalThemes.find(theme => theme.id === id) || terminalThemes[0];
}

export function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") return defaultAppSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAppSettings;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultAppSettings;
  }
}

export function saveAppSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function sanitizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    return defaultAppSettings;
  }
  const settings = value as Partial<AppSettings>;
  const themeMode = ["light", "dark", "system"].includes(String(settings.themeMode))
    ? settings.themeMode as ThemeMode
    : defaultAppSettings.themeMode;
  const terminalTheme = terminalThemes.some(theme => theme.id === settings.terminalTheme)
    ? String(settings.terminalTheme)
    : defaultAppSettings.terminalTheme;
  const terminalFontFamily = fontOptions.includes(String(settings.terminalFontFamily))
    ? String(settings.terminalFontFamily)
    : defaultAppSettings.terminalFontFamily;
  const terminalFontSize = clampNumber(settings.terminalFontSize, 10, 24, defaultAppSettings.terminalFontSize);
  const keepAliveInterval = clampNumber(settings.keepAliveInterval, 30, 300, defaultAppSettings.keepAliveInterval);
  const sync = sanitizeSyncSettings(settings.sync);

  return {
    ...defaultAppSettings,
    ...settings,
    themeMode,
    terminalTheme,
    terminalFontFamily,
    terminalFontSize,
    keepAliveInterval,
    compactMode: Boolean(settings.compactMode),
    largeRadius: settings.largeRadius ?? defaultAppSettings.largeRadius,
    confirmClose: settings.confirmClose ?? defaultAppSettings.confirmClose,
    autoReconnect: settings.autoReconnect ?? defaultAppSettings.autoReconnect,
    keepAlive: settings.keepAlive ?? defaultAppSettings.keepAlive,
    sync,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function sanitizeSyncSettings(value: unknown): SyncSettings {
  if (!value || typeof value !== "object") {
    return defaultAppSettings.sync;
  }
  const sync = value as Partial<SyncSettings>;
  const provider = syncProviders.includes(String(sync.provider) as SyncProvider)
    ? sync.provider as SyncProvider
    : defaultAppSettings.sync.provider;
  const strategy = syncStrategies.includes(String(sync.strategy) as SyncStrategy)
    ? sync.strategy as SyncStrategy
    : defaultAppSettings.sync.strategy;
  const scopeValue = sync.scope && typeof sync.scope === "object" ? sync.scope : {};

  return {
    ...defaultAppSettings.sync,
    ...sync,
    enabled: Boolean(sync.enabled),
    provider,
    token: typeof sync.token === "string" ? sync.token : "",
    fragment: typeof sync.fragment === "string" ? sync.fragment : defaultAppSettings.sync.fragment,
    strategy,
    scope: allSyncScopeItems.reduce((scope, key) => {
      scope[key] = syncScopeItems.includes(key)
        ? Boolean((scopeValue as Partial<Record<SyncScopeKey, boolean>>)[key] ?? defaultAppSettings.sync.scope[key])
        : false;
      return scope;
    }, {} as Record<SyncScopeKey, boolean>),
    lastSyncedAt: typeof sync.lastSyncedAt === "string" ? sync.lastSyncedAt : null,
  };
}
