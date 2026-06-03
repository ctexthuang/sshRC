import { useState, useEffect, useRef } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/pages/Dashboard";
import { Connections, type ConnectionFilters } from "./components/pages/Connections";
import { TerminalPage, type TerminalOpenRequest } from "./components/pages/Terminal";
import { FileManager } from "./components/pages/FileManager";
import { KeyManagement } from "./components/pages/KeyManagement";
import { Settings } from "./components/pages/Settings";
import { NewConnectionModal } from "./components/NewConnectionModal";
import {
  getTerminalTheme,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
  type ThemeMode,
} from "./lib/settings";
import { exportSyncData, runSync } from "./lib/sync";

type Page = "dashboard" | "connections" | "terminal" | "files" | "keys" | "settings";

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
  const [page, setPage] = useState<Page>("dashboard");
  const [showModal, setShowModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [terminalOpenRequest, setTerminalOpenRequest] = useState<TerminalOpenRequest | undefined>();
  const [fileConnectionId, setFileConnectionId] = useState<string | undefined>();
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const terminalRequestSeq = useRef(0);
  const autoSyncReady = useRef(false);
  const startupSyncDone = useRef(false);
  const [connectionFilters, setConnectionFilters] = useState<ConnectionFilters>({
    search: "",
    activeTag: "all",
    statusFilter: "all",
  });
  const isMobile = useIsMobile();

  useTheme(settings.themeMode);
  useAppSettingsEffects(settings);

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
        setFileConnectionId(extra.connectionId);
      }
    }
    selectPage(p);
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
        return <FileManager isMobile={isMobile} connectionId={fileConnectionId} />;
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
    </div>
  );
}
