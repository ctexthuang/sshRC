import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, Check, Download, Upload, FileJson, X, Eye, EyeOff, RefreshCw, Cloud, ExternalLink, PackageOpen } from "lucide-react";
import {
  checkLatestRelease,
  downloadLatestInstaller,
  exportData,
  getReleaseInfo,
  importData,
  openLatestReleasePage,
  type LatestReleaseInfo,
  type ReleaseInfo,
} from "../../lib/api";
import type { DataExportResult, DataImportResult } from "../../lib/types";
import { useI18n, type Language } from "../../lib/i18n";
import {
  fontOptions,
  syncProviders,
  syncScopeItems,
  syncStrategies,
  terminalThemes,
  type AppSettings,
  type SyncScopeKey,
  type SyncSettings,
} from "../../lib/settings";
import { exportSyncData, importSyncData, runSync, type SyncOperationResult } from "../../lib/sync";
import { DesignSelect } from "../DesignSelect";
const importClients = [
  { id: "termora", labelKey: "settingsImportClientTermora", descriptionKey: "settingsImportClientTermoraDesc" },
  { id: "sshcr", labelKey: "settingsImportClientSshcr", descriptionKey: "settingsImportClientSshcrDesc" },
] as const;

type ImportClient = typeof importClients[number]["id"];

const syncProviderLabelKeys: Record<SyncSettings["provider"], string> = {
  github: "settingsSyncProviderGithub",
  gitlab: "settingsSyncProviderGitlab",
  gitee: "settingsSyncProviderGitee",
  webdav: "settingsSyncProviderWebdav",
};

const syncStrategyLabelKeys: Record<SyncSettings["strategy"], string> = {
  manual: "settingsSyncStrategyManual",
  "on-change": "settingsSyncStrategyOnChange",
  startup: "settingsSyncStrategyStartup",
};

const syncScopeLabelKeys: Record<SyncScopeKey, string> = {
  connections: "settingsSyncScopeConnections",
  keys: "settingsSyncScopeKeys",
  keywordHighlight: "settingsSyncScopeKeywordHighlight",
  macros: "settingsSyncScopeMacros",
  keyboard: "settingsSyncScopeKeyboard",
  snippets: "settingsSyncScopeSnippets",
};

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onDataChanged: () => void;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section rounded-2xl border overflow-hidden" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
      <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{title}</h3>
      </div>
      <div className="settings-section-body p-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row flex items-center justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 transition-colors"
      style={{
        width: 44, height: 24, borderRadius: 12,
        backgroundColor: checked ? "var(--primary)" : "var(--switch-background)",
      }}
    >
      <div className="absolute top-1 transition-all"
        style={{
          width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff",
          left: checked ? 24 : 4,
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

function SyncField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="items-center gap-3"
      style={{ display: "grid", gridTemplateColumns: "104px minmax(0, 1fr)" }}
    >
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SettingsInput({
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
  paddingRight = 12,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  paddingRight?: number;
}) {
  return (
    <input
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      className="w-full rounded-xl border outline-none transition-colors"
      style={{
        height: 39,
        padding: `0 ${paddingRight}px 0 12px`,
        borderColor: "var(--border)",
        backgroundColor: "var(--input-background)",
        color: "var(--foreground)",
        fontSize: 13,
        fontFamily: mono ? "var(--font-mono, 'JetBrains Mono', monospace)" : "inherit",
      }}
      onFocus={event => (event.currentTarget.style.borderColor = "var(--primary)")}
      onBlur={event => (event.currentTarget.style.borderColor = "var(--border)")}
    />
  );
}

function ScopeCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        className="flex items-center justify-center border"
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          borderColor: checked ? "var(--primary)" : "var(--border)",
          backgroundColor: checked ? "var(--primary)" : "var(--input-background)",
          color: "#fff",
        }}
      >
        {checked && <Check size={13} strokeWidth={2.4} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{label}</span>
    </label>
  );
}

function formatImportResult(result: DataImportResult, t: (key: string, params?: Record<string, string | number>) => string) {
  const summary = t("settingsImportResult", {
    format: result.format,
    connections: result.connectionsImported,
    keys: result.sshKeysImported,
    skipped: result.skipped,
  });
  return result.warnings.length ? `${summary}\n${result.warnings.slice(0, 5).join("\n")}` : summary;
}

function formatExportResult(result: DataExportResult, t: (key: string, params?: Record<string, string | number>) => string) {
  return t("settingsExportResult", {
    connections: result.connectionsExported,
    keys: result.sshKeysExported,
    path: result.path || "sshcr-export.json",
  });
}

function formatSyncExportResult(result: DataExportResult | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  return t("settingsSyncExportResult", {
    connections: result?.connectionsExported ?? 0,
    keys: result?.sshKeysExported ?? 0,
  });
}

function formatSyncImportResult(result: DataImportResult | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  return t("settingsSyncImportResult", {
    connections: result?.connectionsImported ?? 0,
    keys: result?.sshKeysImported ?? 0,
    skipped: result?.skipped ?? 0,
  });
}

function formatSyncNowResult(result: SyncOperationResult, t: (key: string, params?: Record<string, string | number>) => string) {
  return t("settingsSyncNowResult", {
    importedConnections: result.importResult?.connectionsImported ?? 0,
    importedKeys: result.importResult?.sshKeysImported ?? 0,
    exportedConnections: result.exportResult?.connectionsExported ?? 0,
    exportedKeys: result.exportResult?.sshKeysExported ?? 0,
  });
}

function formatSyncTime(value: string | null | undefined, t: (key: string) => string) {
  if (!value) return t("commonNever");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatLatestReleaseResult(result: LatestReleaseInfo, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!result.supported) {
    return t("settingsUpdateUnsupported");
  }
  if (result.updateAvailable) {
    return t("settingsUpdateAvailable", { version: result.version });
  }
  return t("settingsUpdateLatest", { version: result.currentVersion });
}

function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Settings({ settings, onSettingsChange, onDataChanged }: SettingsProps) {
  const { language, setLanguage, t } = useI18n();
  const [showImportModal, setShowImportModal] = useState(false);
  const [dataBusy, setDataBusy] = useState<"import" | "export" | null>(null);
  const [dataMessage, setDataMessage] = useState("");
  const [dataError, setDataError] = useState("");
  const [syncBusy, setSyncBusy] = useState<"sync" | "export" | "import" | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [releaseBusy, setReleaseBusy] = useState<"check" | "download" | null>(null);
  const [releaseMessage, setReleaseMessage] = useState("");
  const [releaseError, setReleaseError] = useState("");

  useEffect(() => {
    getReleaseInfo()
      .then(setReleaseInfo)
      .catch(err => setReleaseError(err instanceof Error ? err.message : String(err)));
  }, []);

  const updateSyncSettings = (patch: Partial<SyncSettings>) => {
    onSettingsChange({ sync: { ...settings.sync, ...patch } });
  };

  const updateSyncScope = (key: SyncScopeKey, value: boolean) => {
    updateSyncSettings({ scope: { ...settings.sync.scope, [key]: value } });
  };

  const runImport = async (content: string) => {
    setDataBusy("import");
    setDataError("");
    setDataMessage("");
    try {
      const result = await importData({ content });
      onDataChanged();
      setDataMessage(formatImportResult(result, t));
      setShowImportModal(false);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err));
    } finally {
      setDataBusy(null);
    }
  };

  const runExport = async () => {
    setDataBusy("export");
    setDataError("");
    setDataMessage("");
    try {
      const result = await exportData({});
      downloadJson(result.content, "sshcr-export.json");
      setDataMessage(formatExportResult(result, t));
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err));
    } finally {
      setDataBusy(null);
    }
  };

  const validateSyncSettings = () => {
    if (!settings.sync.enabled) return t("settingsSyncDisabledError");
    if (!settings.sync.token.trim()) return t("settingsSyncTokenRequired");
    if (!settings.sync.fragment.trim()) return t("settingsSyncFragmentRequired");
    if (!Object.values(settings.sync.scope).some(Boolean)) return t("settingsSyncScopeRequired");
    return "";
  };

  const finishSyncAction = (syncedAt: string, message: string) => {
    updateSyncSettings({ lastSyncedAt: syncedAt });
    setSyncMessage(message);
  };

  const runSyncAction = async (mode: "sync" | "export" | "import") => {
    const validationError = validateSyncSettings();
    if (validationError) {
      setSyncError(validationError);
      setSyncMessage("");
      return;
    }

    setSyncBusy(mode);
    setSyncError("");
    setSyncMessage("");
    try {
      if (mode === "import") {
        const result = await importSyncData(settings.sync);
        onDataChanged();
        finishSyncAction(result.syncedAt, formatSyncImportResult(result.importResult, t));
      } else if (mode === "export") {
        const result = await exportSyncData(settings.sync);
        finishSyncAction(result.syncedAt, formatSyncExportResult(result.exportResult, t));
      } else {
        const result = await runSync(settings.sync);
        onDataChanged();
        finishSyncAction(result.syncedAt, formatSyncNowResult(result, t));
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusy(null);
    }
  };

  const runUpdateCheck = async () => {
    setReleaseBusy("check");
    setReleaseError("");
    setReleaseMessage("");
    try {
      const result = await checkLatestRelease();
      setReleaseMessage(formatLatestReleaseResult(result, t));
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : String(err));
    } finally {
      setReleaseBusy(null);
    }
  };

  const runInstallerDownload = async () => {
    setReleaseBusy("download");
    setReleaseError("");
    setReleaseMessage("");
    try {
      const result = await downloadLatestInstaller(true);
      setReleaseMessage(t("settingsInstallerDownloaded", { path: result.path }));
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : String(err));
    } finally {
      setReleaseBusy(null);
    }
  };

  const openReleasePage = async () => {
    setReleaseError("");
    try {
      await openLatestReleasePage();
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", overscrollBehavior: "contain" }}>
      <div className="p-5 lg:p-7 max-w-[720px] mx-auto">
        <div className="mb-6">
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--foreground)" }}>{t("settingsTitle")}</h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>{t("settingsSubtitle")}</p>
        </div>

        <div className="flex flex-col gap-5">
          <SectionCard title={t("settingsLanguage")}>
            <SettingRow label={t("settingsLanguage")} description={t("settingsLanguageDesc")}>
              <div className="flex items-center p-1 rounded-xl gap-1" style={{ backgroundColor: "var(--muted)" }}>
                {([
                  { value: "zh-CN", label: "中文" },
                  { value: "en", label: "English" },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLanguage(opt.value as Language)}
                    className="px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      fontSize: 12,
                      fontWeight: language === opt.value ? 500 : 400,
                      backgroundColor: language === opt.value ? "var(--card)" : "transparent",
                      color: language === opt.value ? "var(--foreground)" : "var(--muted-foreground)",
                      boxShadow: language === opt.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </SettingRow>
          </SectionCard>

          {/* Appearance */}
          <SectionCard title={t("settingsAppearance")}>
            {/* Theme */}
            <SettingRow label={t("settingsTheme")} description={t("settingsThemeDesc")}>
              <div className="flex items-center p-1 rounded-xl gap-1" style={{ backgroundColor: "var(--muted)" }}>
                {([
                  { value: "light", icon: Sun, label: t("themeLight") },
                  { value: "dark", icon: Moon, label: t("themeDark") },
                  { value: "system", icon: Monitor, label: t("themeSystem") },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onSettingsChange({ themeMode: opt.value })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      fontSize: 12,
                      fontWeight: settings.themeMode === opt.value ? 500 : 400,
                      backgroundColor: settings.themeMode === opt.value ? "var(--card)" : "transparent",
                      color: settings.themeMode === opt.value ? "var(--foreground)" : "var(--muted-foreground)",
                      boxShadow: settings.themeMode === opt.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}>
                    <opt.icon size={13} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow label={t("settingsCompactMode")} description={t("settingsCompactModeDesc")}>
              <Toggle checked={settings.compactMode} onChange={compactMode => onSettingsChange({ compactMode })} />
            </SettingRow>

            <SettingRow label={t("settingsLargeRadius")} description={t("settingsLargeRadiusDesc")}>
              <Toggle checked={settings.largeRadius} onChange={largeRadius => onSettingsChange({ largeRadius })} />
            </SettingRow>
          </SectionCard>

          {/* Terminal */}
          <SectionCard title={t("settingsTerminal")}>
            <SettingRow label={t("settingsFontFamily")} description={t("settingsFontFamilyDesc")}>
              <DesignSelect
                value={settings.terminalFontFamily}
                onChange={terminalFontFamily => onSettingsChange({ terminalFontFamily })}
                options={fontOptions.map(font => ({ value: font, label: font }))}
                compact
                mono
                minWidth={174}
              />
            </SettingRow>

            <SettingRow label={t("settingsFontSize")} description={t("settingsFontSizeDesc", { size: settings.terminalFontSize })}>
              <div className="flex items-center gap-3">
                <button onClick={() => onSettingsChange({ terminalFontSize: Math.max(10, settings.terminalFontSize - 1) })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}>
                  −
                </button>
                <span style={{ fontSize: 13, color: "var(--foreground)", minWidth: 28, textAlign: "center" }}>{settings.terminalFontSize}</span>
                <button onClick={() => onSettingsChange({ terminalFontSize: Math.min(24, settings.terminalFontSize + 1) })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}>
                  +
                </button>
              </div>
            </SettingRow>

            <div className="py-3">
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", marginBottom: 12 }}>{t("settingsColorScheme")}</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {terminalThemes.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => onSettingsChange({ terminalTheme: theme.id })}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all"
                    style={{
                      borderColor: settings.terminalTheme === theme.id ? "var(--primary)" : "var(--border)",
                      backgroundColor: settings.terminalTheme === theme.id ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    <div className="w-full h-8 rounded-lg flex items-center justify-center gap-0.5"
                      style={{ backgroundColor: theme.bg }}>
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: "#f87171" }} />
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: "#fbbf24" }} />
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: "#34d399" }} />
                    </div>
                    <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{theme.name}</span>
                    {settings.terminalTheme === theme.id && <Check size={10} style={{ color: "var(--primary)" }} />}
                  </button>
                ))}
              </div>

              {/* Preview */}
              <div className="mt-3 p-3 rounded-xl overflow-hidden"
                style={{ backgroundColor: terminalThemes.find(t => t.id === settings.terminalTheme)?.bg || "#15171d" }}>
                <p style={{ fontFamily: `'${settings.terminalFontFamily}', monospace`, fontSize: settings.terminalFontSize, lineHeight: 1.6, color: terminalThemes.find(t => t.id === settings.terminalTheme)?.accent, margin: 0 }}>
                  user@sshcr:~$
                  <span style={{ color: terminalThemes.find(t => t.id === settings.terminalTheme)?.fg }}> ls -la</span>
                </p>
                <p style={{ fontFamily: `'${settings.terminalFontFamily}', monospace`, fontSize: settings.terminalFontSize, lineHeight: 1.6, color: terminalThemes.find(t => t.id === settings.terminalTheme)?.fg, opacity: 0.8, margin: 0 }}>
                  total 24 | drwxr-xr-x 4 ubuntu ubuntu
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Connection */}
          <SectionCard title={t("settingsConnection")}>
            <SettingRow label={t("settingsAutoReconnect")} description={t("settingsAutoReconnectDesc")}>
              <Toggle checked={settings.autoReconnect} onChange={autoReconnect => onSettingsChange({ autoReconnect })} />
            </SettingRow>
            <SettingRow label={t("settingsKeepAlive")} description={t("settingsKeepAliveDesc", { seconds: settings.keepAliveInterval })}>
              <div className="flex items-center gap-2">
                <Toggle checked={settings.keepAlive} onChange={keepAlive => onSettingsChange({ keepAlive })} />
                {settings.keepAlive && (
                  <DesignSelect
                    value={settings.keepAliveInterval}
                    onChange={keepAliveInterval => onSettingsChange({ keepAliveInterval })}
                    options={[30, 60, 120, 300].map(seconds => ({ value: seconds, label: `${seconds}s` }))}
                    compact
                    minWidth={82}
                  />
                )}
              </div>
            </SettingRow>
            <SettingRow label={t("settingsConfirmClose")} description={t("settingsConfirmCloseDesc")}>
              <Toggle checked={settings.confirmClose} onChange={confirmClose => onSettingsChange({ confirmClose })} />
            </SettingRow>
          </SectionCard>

          {/* Sync */}
          <SectionCard title={t("settingsSync")}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: "var(--accent)", color: "var(--primary)" }}>
                    <Cloud size={17} />
                  </div>
                  <div className="min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{t("settingsSyncEnable")}</p>
                    <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.5 }}>
                      {t("settingsSyncDesc")}
                    </p>
                  </div>
                </div>
                <Toggle checked={settings.sync.enabled} onChange={enabled => updateSyncSettings({ enabled })} />
              </div>

              <div className="flex flex-col gap-3">
                <SyncField label={t("settingsSyncType")}>
                  <DesignSelect
                    value={settings.sync.provider}
                    onChange={provider => updateSyncSettings({ provider })}
                    options={syncProviders.map(provider => ({ value: provider, label: t(syncProviderLabelKeys[provider]) }))}
                    fullWidth
                  />
                </SyncField>

                <SyncField label={t("settingsSyncToken")}>
                  <div className="relative">
                    <SettingsInput
                      value={settings.sync.token}
                      onChange={token => updateSyncSettings({ token })}
                      type={showToken ? "text" : "password"}
                      placeholder={t("settingsSyncTokenPlaceholder")}
                      mono
                      paddingRight={42}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(value => !value)}
                      className="absolute right-2 top-1/2 flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                      style={{ transform: "translateY(-50%)", color: "var(--muted-foreground)" }}
                    >
                      {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </SyncField>

                <SyncField label={t("settingsSyncFragment")}>
                  <SettingsInput
                    value={settings.sync.fragment}
                    onChange={fragment => updateSyncSettings({ fragment })}
                    placeholder={t("settingsSyncFragmentPlaceholder")}
                    mono
                  />
                </SyncField>

                <SyncField label={t("settingsSyncStrategy")}>
                  <DesignSelect
                    value={settings.sync.strategy}
                    onChange={strategy => updateSyncSettings({ strategy })}
                    options={syncStrategies.map(strategy => ({ value: strategy, label: t(syncStrategyLabelKeys[strategy]) }))}
                    fullWidth
                  />
                </SyncField>

                <SyncField label={t("settingsSyncScope")}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    {syncScopeItems.map(scope => (
                      <ScopeCheckbox
                        key={scope}
                        checked={settings.sync.scope[scope]}
                        label={t(syncScopeLabelKeys[scope])}
                        onChange={value => updateSyncScope(scope, value)}
                      />
                    ))}
                  </div>
                </SyncField>
              </div>

              <div className="flex flex-col gap-3 pt-1">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={() => void runSyncAction("sync")}
                    disabled={syncBusy !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-white transition-all disabled:opacity-50"
                    style={{ minWidth: 102, height: 38, padding: "0 14px", backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}
                  >
                    <RefreshCw size={14} className={syncBusy === "sync" ? "animate-spin" : undefined} />
                    {syncBusy === "sync" ? t("settingsSyncing") : t("settingsSyncNow")}
                  </button>
                  <button
                    onClick={() => void runSyncAction("export")}
                    disabled={syncBusy !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border transition-all disabled:opacity-50"
                    style={{ minWidth: 92, height: 38, padding: "0 14px", borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)", fontSize: 13, fontWeight: 500 }}
                  >
                    <Upload size={14} />
                    {syncBusy === "export" ? t("settingsSyncExporting") : t("settingsSyncExport")}
                  </button>
                  <button
                    onClick={() => void runSyncAction("import")}
                    disabled={syncBusy !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border transition-all disabled:opacity-50"
                    style={{ minWidth: 92, height: 38, padding: "0 14px", borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)", fontSize: 13, fontWeight: 500 }}
                  >
                    <Download size={14} />
                    {syncBusy === "import" ? t("settingsSyncImporting") : t("settingsSyncImport")}
                  </button>
                </div>

                <div className="text-right" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  {t("settingsSyncLastTime", { time: formatSyncTime(settings.sync.lastSyncedAt, t) })}
                </div>

                {(syncMessage || syncError) && (
                  <div
                    className="rounded-2xl border px-4 py-3"
                    style={{
                      borderColor: syncError ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.25)",
                      backgroundColor: syncError ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                      color: syncError ? "var(--destructive)" : "var(--online)",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {syncError || syncMessage}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Data */}
          <SectionCard title={t("settingsData")}>
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{t("settingsImportData")}</p>
                    <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                      {t("settingsImportDataDesc")}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowImportModal(true)}
                    disabled={dataBusy !== null}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-white transition-all disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                    style={{ minWidth: 92, height: 38, backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}
                  >
                    <Upload size={14} /> {t("commonImport")}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{t("settingsExportData")}</p>
                    <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                      {t("settingsExportDataDesc")}
                    </p>
                  </div>
                  <button
                    onClick={() => void runExport()}
                    disabled={dataBusy !== null}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border transition-all disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                    style={{ minWidth: 92, height: 38, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)", fontSize: 13, fontWeight: 500 }}
                  >
                    <Download size={14} /> {dataBusy === "export" ? t("settingsExporting") : t("commonExport")}
                  </button>
                </div>
              </div>

              {(dataMessage || dataError) && (
                <div
                  className="rounded-2xl border px-4 py-3"
                  style={{
                    borderColor: dataError ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.25)",
                    backgroundColor: dataError ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                    color: dataError ? "var(--destructive)" : "var(--online)",
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {dataError || dataMessage}
                </div>
              )}
            </div>
          </SectionCard>

          {/* About */}
          <SectionCard title={t("settingsAbout")}>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4 py-2">
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{t("appName")}</p>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>
                    {t("settingsVersion", { version: releaseInfo?.currentVersion || "0.1.0" })}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>
                    {t("settingsReleaseTarget", { target: releaseInfo?.target || "..." })}
                  </p>
                </div>
                <button
                  onClick={() => void runUpdateCheck()}
                  disabled={releaseBusy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border transition-all disabled:opacity-50"
                  style={{ minWidth: 102, height: 34, padding: "0 12px", fontSize: 12, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}
                >
                  <RefreshCw size={13} className={releaseBusy === "check" ? "animate-spin" : undefined} />
                  {releaseBusy === "check" ? t("settingsCheckingUpdates") : t("settingsCheckUpdates")}
                </button>
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-[220px] flex-1">
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{t("settingsInstaller")}</p>
                    <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                      {releaseInfo?.assetName || t("settingsReleaseUnsupported")}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 5, lineHeight: 1.5 }}>
                      {t("settingsInstallerDesc")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => void runInstallerDownload()}
                      disabled={!releaseInfo?.supported || releaseBusy !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-xl text-white transition-all disabled:opacity-50"
                      style={{ minWidth: 136, height: 38, padding: "0 14px", backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}
                    >
                      <PackageOpen size={14} />
                      {releaseBusy === "download" ? t("settingsDownloadingInstaller") : t("settingsDownloadInstaller")}
                    </button>
                    <button
                      onClick={() => void openReleasePage()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border transition-all"
                      style={{ minWidth: 108, height: 38, padding: "0 14px", borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)", fontSize: 13, fontWeight: 500 }}
                    >
                      <ExternalLink size={14} />
                      {t("settingsOpenRelease")}
                    </button>
                  </div>
                </div>
              </div>

              {(releaseMessage || releaseError) && (
                <div
                  className="rounded-2xl border px-4 py-3"
                  style={{
                    borderColor: releaseError ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.25)",
                    backgroundColor: releaseError ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                    color: releaseError ? "var(--destructive)" : "var(--online)",
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {releaseError || releaseMessage}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
      {showImportModal && (
        <ImportDataModal
          busy={dataBusy === "import"}
          error={dataError}
          onClose={() => {
            if (!dataBusy) setShowImportModal(false);
          }}
          onImport={content => void runImport(content)}
          t={t}
        />
      )}
    </div>
  );
}

function ImportDataModal({
  busy,
  error,
  onClose,
  onImport,
  t,
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onImport: (content: string, client: ImportClient) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [client, setClient] = useState<ImportClient>("termora");
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [localError, setLocalError] = useState("");
  const [dragging, setDragging] = useState(false);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setLocalError(t("settingsImportFileTypeError"));
      return;
    }
    try {
      const text = await file.text();
      setFileName(file.name);
      setContent(text);
      setLocalError("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--accent)", color: "var(--primary)" }}>
              <Upload size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>{t("settingsImportModalTitle")}</h2>
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{t("settingsImportModalSubtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
            style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 10 }}>{t("settingsImportClient")}</p>
            <div className="grid grid-cols-2 gap-3">
              {importClients.map(option => {
                const selected = client === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => setClient(option.id)}
                    className="text-left rounded-2xl border p-4 transition-all"
                    style={{
                      minHeight: 92,
                      borderColor: selected ? "var(--primary)" : "var(--border)",
                      backgroundColor: selected ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span style={{ fontSize: 13, fontWeight: 600, color: selected ? "var(--primary)" : "var(--foreground)" }}>
                        {t(option.labelKey)}
                      </span>
                      {selected && <Check size={15} style={{ color: "var(--primary)" }} />}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.45 }}>
                      {t(option.descriptionKey)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <label
            className="relative block rounded-3xl border border-dashed p-6 text-center transition-all cursor-pointer"
            style={{
              minHeight: 180,
              borderColor: dragging ? "var(--primary)" : "var(--border)",
              backgroundColor: dragging ? "var(--accent)" : "var(--muted)",
            }}
            onDragOver={event => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => {
              event.preventDefault();
              setDragging(false);
              void pickFile(event.dataTransfer.files?.[0]);
            }}
          >
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={event => void pickFile(event.target.files?.[0])}
            />
            <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--card)", color: "var(--primary)" }}>
              <FileJson size={22} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginTop: 14 }}>
              {fileName || t("settingsImportDropTitle")}
            </p>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>
              {fileName ? t("settingsImportFileReady") : t("settingsImportDropDesc")}
            </p>
          </label>

          {(localError || error) && (
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "var(--destructive)", fontSize: 12 }}
            >
              {localError || error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl border transition-colors disabled:opacity-50"
            style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}
          >
            {t("commonCancel")}
          </button>
          <button
            onClick={() => {
              if (!content) {
                setLocalError(t("settingsImportFileRequired"));
                return;
              }
              onImport(content, client);
            }}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all disabled:opacity-50"
            style={{ minWidth: 112, backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}
          >
            <Upload size={14} /> {busy ? t("settingsImporting") : t("settingsStartImport")}
          </button>
        </div>
      </div>
    </div>
  );
}
