import { useState, useEffect, useRef } from "react";
import { ExternalLink, FolderOpen, PackageOpen, X } from "lucide-react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/pages/Dashboard";
import { Connections, type ConnectionFilters } from "./components/pages/Connections";
import { TerminalPage, type TerminalOpenRequest } from "./components/pages/Terminal";
import { FileManager } from "./components/pages/FileManager";
import { KeyManagement } from "./components/pages/KeyManagement";
import { Settings } from "./components/pages/Settings";
import { NewConnectionModal } from "./components/NewConnectionModal";
import {
  checkLatestRelease,
  downloadLatestInstaller,
  getConnection,
  openLatestReleasePage,
  type LatestReleaseInfo,
} from "./lib/api";
import { useI18n } from "./lib/i18n";
import type { Connection } from "./lib/types";
import {
  getTerminalTheme,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
  type ThemeMode,
} from "./lib/settings";
import { exportSyncData, runSync } from "./lib/sync";

type Page = "dashboard" | "connections" | "terminal" | "files" | "keys" | "settings";

interface PendingFtpSwitch {
  connectionId: string;
  connection: Connection | null;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

function useTheme(mode: ThemeMode) {
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "dark") {
      root.classList.add("dark");
    } else if (mode === "light") {
      root.classList.remove("dark");
    } else {
      // system
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = (e: MediaQueryListEvent | MediaQueryList) => {
        e.matches ? root.classList.add("dark") : root.classList.remove("dark");
      };
      apply(mq);
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [mode]);
}

function useAppSettingsEffects(settings: AppSettings) {
  useEffect(() => {
    saveAppSettings(settings);

    const root = document.documentElement;
    const terminalTheme = getTerminalTheme(settings.terminalTheme);
    root.dataset.compact = String(settings.compactMode);
    root.dataset.largeRadius = String(settings.largeRadius);
    root.style.setProperty("--terminal-bg", terminalTheme.bg);
    root.style.setProperty("--terminal-fg", terminalTheme.fg);
    root.style.setProperty("--terminal-green", terminalTheme.accent);
    root.style.setProperty("--terminal-blue", terminalTheme.accent);
    root.style.setProperty("--terminal-cyan", terminalTheme.accent);
  }, [settings]);
}

export default function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>("dashboard");
  const [showModal, setShowModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [terminalOpenRequest, setTerminalOpenRequest] = useState<TerminalOpenRequest | undefined>();
  const [fileConnectionId, setFileConnectionId] = useState<string | undefined>();
  const [activeFileConnection, setActiveFileConnection] = useState<Connection | null>(null);
  const [pendingFtpSwitch, setPendingFtpSwitch] = useState<PendingFtpSwitch | null>(null);
  const [ftpSwitchError, setFtpSwitchError] = useState("");
  const [startupRelease, setStartupRelease] = useState<LatestReleaseInfo | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [startupUpdateBusy, setStartupUpdateBusy] = useState<"download" | null>(null);
  const [startupUpdateError, setStartupUpdateError] = useState("");
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const terminalRequestSeq = useRef(0);
  const autoSyncReady = useRef(false);
  const startupSyncDone = useRef(false);
  const startupUpdateCheckDone = useRef(false);
  const [connectionFilters, setConnectionFilters] = useState<ConnectionFilters>({
    search: "",
    activeTag: "all",
    statusFilter: "all",
  });
  const isMobile = useIsMobile();

  useTheme(settings.themeMode);
  useAppSettingsEffects(settings);

  useEffect(() => {
    if (startupUpdateCheckDone.current) return;
    startupUpdateCheckDone.current = true;

    checkLatestRelease()
      .then(result => {
        if (result.updateAvailable) {
          setStartupRelease(result);
          setStartupUpdateError("");
          setShowUpdatePrompt(true);
        }
      })
      .catch(error => {
        if (!isReleaseNotFoundError(error)) {
          console.error(error);
        }
      });
  }, []);

  useEffect(() => {
    if (!fileConnectionId) {
      setActiveFileConnection(null);
      return;
    }

    let cancelled = false;
    getConnection(fileConnectionId)
      .then(connection => {
        if (!cancelled) {
          setActiveFileConnection(connection);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveFileConnection(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileConnectionId]);

  useEffect(() => {
    if (
      startupSyncDone.current ||
      !settings.sync.enabled ||
      settings.sync.strategy !== "startup" ||
      !settings.sync.token.trim() ||
      !settings.sync.fragment.trim()
    ) {
      return;
    }

    startupSyncDone.current = true;
    runSync(settings.sync)
      .then(result => {
        setSettings(current => ({ ...current, sync: { ...current.sync, lastSyncedAt: result.syncedAt } }));
        setRefreshToken(token => token + 1);
      })
      .catch(error => console.error(error));
  }, [settings.sync]);

  useEffect(() => {
    if (!autoSyncReady.current) {
      autoSyncReady.current = true;
      return;
    }
    if (
      !settings.sync.enabled ||
      settings.sync.strategy !== "on-change" ||
      !settings.sync.token.trim() ||
      !settings.sync.fragment.trim()
    ) {
      return;
    }

    exportSyncData(settings.sync)
      .then(result => {
        setSettings(current => ({ ...current, sync: { ...current.sync, lastSyncedAt: result.syncedAt } }));
      })
      .catch(error => console.error(error));
  }, [refreshToken]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings(current => ({ ...current, ...patch }));
  };

  const selectPage = (p: string) => {
    if (p === "terminal") {
      setTerminalMounted(true);
    }
    setPage(p as Page);
  };

  const navigate = (p: string, extra?: { connectionId?: string }) => {
    if (extra?.connectionId) {
      if (p === "terminal") {
        terminalRequestSeq.current += 1;
        setTerminalOpenRequest({
          requestId: terminalRequestSeq.current,
          connectionId: extra.connectionId,
        });
      } else if (p === "files") {
        void requestFileConnection(extra.connectionId);
        return;
      }
    }
    selectPage(p);
  };

  const requestFileConnection = async (connectionId: string) => {
    setFtpSwitchError("");
    if (fileConnectionId && fileConnectionId !== connectionId) {
      try {
        const connection = await getConnection(connectionId);
        setPendingFtpSwitch({ connectionId, connection });
      } catch (err) {
        setPendingFtpSwitch({ connectionId, connection: null });
        setFtpSwitchError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    setFileConnectionId(connectionId);
    selectPage("files");
  };

  const confirmFtpSwitch = () => {
    if (!pendingFtpSwitch) return;
    setActiveFileConnection(pendingFtpSwitch.connection);
    setFileConnectionId(pendingFtpSwitch.connectionId);
    setPendingFtpSwitch(null);
    setFtpSwitchError("");
    selectPage("files");
  };

  const handleSavedConnection = (connectionId?: string) => {
    if (connectionId) {
      setFileConnectionId(connectionId);
    }
    setRefreshToken(token => token + 1);
    setShowModal(false);
  };

  const handleTerminalClosed = () => {
    setTerminalOpenRequest(undefined);
  };

  const dismissUpdatePrompt = () => {
    setShowUpdatePrompt(false);
    setStartupUpdateError("");
  };

  const downloadStartupInstaller = async () => {
    setStartupUpdateBusy("download");
    setStartupUpdateError("");
    try {
      await downloadLatestInstaller(true);
      setShowUpdatePrompt(false);
    } catch (err) {
      setStartupUpdateError(err instanceof Error ? err.message : String(err));
    } finally {
      setStartupUpdateBusy(null);
    }
  };

  const openStartupRelease = async () => {
    setStartupUpdateError("");
    try {
      await openLatestReleasePage();
    } catch (err) {
      setStartupUpdateError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderActivePage = () => {
    switch (page) {
      case "dashboard":
        return <Dashboard onNavigate={navigate} onOpenNewConnection={() => setShowModal(true)} isMobile={isMobile} refreshToken={refreshToken} />;
      case "connections":
        return (
          <Connections
            onOpenNewConnection={() => setShowModal(true)}
            onNavigate={navigate}
            isMobile={isMobile}
            refreshToken={refreshToken}
            filters={connectionFilters}
            onFiltersChange={patch => setConnectionFilters(current => ({ ...current, ...patch }))}
          />
        );
      case "terminal":
        return null;
      case "files":
        return (
          <FileManager
            key={fileConnectionId || "preview"}
            isMobile={isMobile}
            connectionId={fileConnectionId}
            connection={activeFileConnection}
          />
        );
      case "keys":
        return <KeyManagement />;
      case "settings":
        return <Settings settings={settings} onSettingsChange={updateSettings} onDataChanged={() => setRefreshToken(token => token + 1)} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Layout
        currentPage={page}
        onNavigate={selectPage}
        onOpenNewConnection={() => setShowModal(true)}
        themeMode={settings.themeMode}
        setThemeMode={themeMode => updateSettings({ themeMode })}
        isMobile={isMobile}
      >
        {page !== "terminal" && renderActivePage()}
        {terminalMounted && (
          <div className={page === "terminal" ? "h-full" : "hidden h-full"}>
            <TerminalPage
              isMobile={isMobile}
              active={page === "terminal"}
              openRequest={terminalOpenRequest}
              onSessionClosed={handleTerminalClosed}
              settings={settings}
            />
          </div>
        )}
      </Layout>

      {showModal && <NewConnectionModal onClose={() => setShowModal(false)} onSaved={handleSavedConnection} />}
      {showUpdatePrompt && startupRelease && (
        <UpdatePromptDialog
          release={startupRelease}
          busy={startupUpdateBusy}
          error={startupUpdateError}
          onClose={dismissUpdatePrompt}
          onDownload={downloadStartupInstaller}
          onOpenRelease={openStartupRelease}
          t={t}
        />
      )}
      {pendingFtpSwitch && (
        <FtpSwitchDialog
          currentConnection={activeFileConnection}
          currentConnectionId={fileConnectionId}
          targetConnection={pendingFtpSwitch.connection}
          targetConnectionId={pendingFtpSwitch.connectionId}
          error={ftpSwitchError}
          onCancel={() => {
            setPendingFtpSwitch(null);
            setFtpSwitchError("");
          }}
          onConfirm={confirmFtpSwitch}
          t={t}
        />
      )}
    </div>
  );
}

function UpdatePromptDialog({
  release,
  busy,
  error,
  onClose,
  onDownload,
  onOpenRelease,
  t,
}: {
  release: LatestReleaseInfo;
  busy: "download" | null;
  error: string;
  onClose: () => void;
  onDownload: () => void;
  onOpenRelease: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const canDownload = Boolean(release.supported && release.downloadUrl);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-3xl border shadow-2xl"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b p-5" style={{ borderColor: "var(--border)" }}>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: "var(--accent)", color: "var(--primary)" }}>
            <PackageOpen size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
              {t("updateDialogTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.55 }}>
              {t("updateDialogSubtitle", { version: release.version })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors"
            style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
            aria-label={t("updateDialogClose")}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              {t("updateDialogCurrent", { version: release.currentVersion })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginTop: 5 }}>
              {release.assetName || t("updateDialogNoInstaller")}
            </div>
          </div>
          {error && (
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "var(--destructive)", fontSize: 12, lineHeight: 1.5 }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onClose}
            className="rounded-xl border px-4 py-2.5 transition-colors"
            style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}
          >
            {t("updateDialogLater")}
          </button>
          <button
            onClick={onOpenRelease}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors"
            style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}
          >
            <ExternalLink size={14} />
            {t("updateDialogOpenRelease")}
          </button>
          <button
            onClick={onDownload}
            disabled={!canDownload || busy !== null}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-white transition-all disabled:opacity-50"
            style={{ fontSize: 13, fontWeight: 500, backgroundColor: "var(--primary)" }}
          >
            <PackageOpen size={14} />
            {busy === "download" ? t("updateDialogDownloading") : t("updateDialogDownload")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FtpSwitchDialog({
  currentConnection,
  currentConnectionId,
  targetConnection,
  targetConnectionId,
  error,
  onCancel,
  onConfirm,
  t,
}: {
  currentConnection: Connection | null;
  currentConnectionId?: string;
  targetConnection: Connection | null;
  targetConnectionId: string;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const currentLabel = connectionDisplayName(currentConnection, currentConnectionId);
  const targetLabel = connectionDisplayName(targetConnection, targetConnectionId);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-3xl border shadow-2xl"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b p-5" style={{ borderColor: "var(--border)" }}>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: "var(--accent)", color: "var(--primary)" }}>
            <FolderOpen size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
              {t("filesSwitchConfirmTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.55 }}>
              {t("filesSwitchConfirmMessage", { current: currentLabel })}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors"
            style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{t("filesClosingFtp")}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginTop: 4 }}>{currentLabel}</div>
          </div>
          <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{t("filesNextFtp")}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginTop: 4 }}>{targetLabel}</div>
          </div>
          {error && (
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "var(--destructive)", fontSize: 12 }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={onCancel}
            className="rounded-xl border px-4 py-2.5 transition-colors"
            style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}
          >
            {t("commonCancel")}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl px-4 py-2.5 text-white transition-all"
            style={{ fontSize: 13, fontWeight: 500, backgroundColor: "var(--primary)" }}
          >
            {t("filesSwitchConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function connectionDisplayName(connection: Connection | null, fallbackId?: string) {
  if (!connection) return fallbackId || "-";
  return `${connection.name} (${connection.username}@${connection.host}:${connection.port})`;
}

function isReleaseNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("GitHub latest release was not found")
    || message.includes("404 Not Found");
}
