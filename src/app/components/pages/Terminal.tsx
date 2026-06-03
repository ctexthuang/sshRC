import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  X, Plus, Maximize2, Minimize2, Copy, Download, Settings2,
  WifiOff, RotateCcw, Search
} from "lucide-react";
import {
  getConnection,
  isTauriRuntime,
  onTerminalConnected,
  onTerminalExit,
  onTerminalOutput,
  saveConnectionPassword,
  startTerminalSession,
  stopTerminalSession,
  writeTerminalSession,
} from "../../lib/api";
import type { Connection } from "../../lib/types";
import { useI18n } from "../../lib/i18n";
import { getTerminalTheme, type AppSettings } from "../../lib/settings";

export interface TerminalOpenRequest {
  requestId: number;
  connectionId: string;
}

interface TerminalPageProps {
  isMobile: boolean;
  active: boolean;
  openRequest?: TerminalOpenRequest;
  onSessionClosed: () => void;
  settings: AppSettings;
}

type SessionStatus = "connected" | "connecting" | "disconnected";
type TerminalCredentialKind = "password" | "passphrase";

interface TerminalSessionView {
  id: string;
  connectionId: string;
  connection: Connection | null;
  status: SessionStatus;
  error: string;
  restartToken: number;
}

type TerminalSessionPatch = Partial<Pick<TerminalSessionView, "connection" | "status" | "error">>;

interface TerminalCredentialPrompt {
  kind: TerminalCredentialKind;
  connection: Connection;
  message: string;
}

interface TerminalCredentials {
  password?: string;
  passphrase?: string;
}

export function TerminalPage({ isMobile, active, openRequest, onSessionClosed, settings }: TerminalPageProps) {
  const { t } = useI18n();
  const sessionSeqRef = useRef(0);
  const handledRequestRef = useRef<number | undefined>();
  const hadSessionsRef = useRef(false);
  const credentialsRef = useRef<Record<string, TerminalCredentials>>({});
  const [sessions, setSessions] = useState<TerminalSessionView[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState<string | null>(null);

  const activeSession = sessions.find(session => session.id === activeSessionId) || sessions[0] || null;
  const activeConnection = activeSession?.connection || null;
  const activeStatus = activeSession?.status || "disconnected";
  const activeError = activeSession?.error || "";

  const addSession = (connectionId: string) => {
    sessionSeqRef.current += 1;
    const id = `${connectionId}-${Date.now()}-${sessionSeqRef.current}`;
    const nextSession: TerminalSessionView = {
      id,
      connectionId,
      connection: null,
      status: "connecting",
      error: "",
      restartToken: 0,
    };
    setSessions(current => [...current, nextSession]);
    setActiveSessionId(id);
  };

  const patchSession = (sessionId: string, patch: TerminalSessionPatch) => {
    setSessions(current => current.map(session => (
      session.id === sessionId ? { ...session, ...patch } : session
    )));
  };

  const closeSession = (sessionId: string) => {
    setSessions(current => {
      const closingIndex = current.findIndex(session => session.id === sessionId);
      const remaining = current.filter(session => session.id !== sessionId);
      setActiveSessionId(currentActive => {
        if (currentActive && remaining.some(session => session.id === currentActive)) {
          return currentActive;
        }
        return remaining[Math.min(Math.max(closingIndex, 0), remaining.length - 1)]?.id || null;
      });
      return remaining;
    });
  };

  const requestCloseSession = (sessionId: string | undefined) => {
    if (!sessionId) return;
    const target = sessions.find(session => session.id === sessionId);
    if (!target) return;
    if (settings.confirmClose && target.connection && target.status === "connected") {
      setConfirmingClose(sessionId);
      return;
    }
    closeSession(sessionId);
  };

  const restartActiveSession = () => {
    if (!activeSession) return;
    setSessions(current => current.map(session => (
      session.id === activeSession.id
        ? { ...session, status: "connecting", error: "", restartToken: session.restartToken + 1 }
        : session
    )));
  };

  useEffect(() => {
    if (!openRequest || handledRequestRef.current === openRequest.requestId) return;
    handledRequestRef.current = openRequest.requestId;
    addSession(openRequest.connectionId);
  }, [openRequest?.requestId, openRequest?.connectionId]);

  useEffect(() => {
    if (sessions.length > 0) {
      hadSessionsRef.current = true;
      return;
    }
    if (hadSessionsRef.current) {
      hadSessionsRef.current = false;
      setActiveSessionId(null);
      onSessionClosed();
    }
  }, [sessions.length, onSessionClosed]);

  useEffect(() => {
    if (!active || !activeSession) return;
    setActiveSessionId(activeSession.id);
  }, [active, activeSession?.id]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--background)" }}>
      <div className="px-5 lg:px-7 py-4 flex items-center justify-between border-b flex-shrink-0"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--foreground)" }}>{t("terminalTitle")}</h1>
        <div className="flex items-center gap-2">
          {activeError && !isMobile && (
            <span style={{ fontSize: 12, color: "var(--destructive)" }}>{activeError}</span>
          )}
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors"
            style={{ fontSize: 12, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}>
            <Search size={13} /> {t("terminalFind")}
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors"
            style={{ fontSize: 12, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}>
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {!isMobile && (
          <div className="w-52 flex-shrink-0 border-r flex flex-col"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            <div className="p-3 border-b flex items-center justify-between"
              style={{ borderColor: "var(--border)" }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("terminalSessions")}</span>
              <button
                onClick={() => activeSession && addSession(activeSession.connectionId)}
                disabled={!activeSession}
                className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                style={{ color: "var(--muted-foreground)" }}
                title={activeSession ? t("connectionsOpenSsh") : undefined}
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: "none" }}>
              {sessions.map(session => {
                const isActive = session.id === activeSession?.id;
                const connection = session.connection;
                return (
                  <button
                    key={session.id}
                    onClick={() => setActiveSessionId(session.id)}
                    className="group w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-colors mb-1"
                    style={{ backgroundColor: isActive ? "var(--accent)" : "transparent" }}
                  >
                    <div className="mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5"
                        style={{ backgroundColor: session.status === "connected" ? "var(--online)" : session.status === "connecting" ? "var(--primary)" : "var(--muted-foreground)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {connection?.name || "SSH"}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {connection ? `${connection.username}@${connection.host}` : session.connectionId}
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={event => {
                        event.stopPropagation();
                        requestCloseSession(session.id);
                      }}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          requestCloseSession(session.id);
                        }
                      }}
                      className="w-5 h-5 flex-shrink-0 items-center justify-center rounded-md transition-colors"
                      style={{
                        display: isActive ? "flex" : "none",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      <X size={11} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={`flex-1 flex flex-col overflow-hidden ${isFullscreen ? "fixed inset-0 z-50" : ""}`}>
          {isMobile && sessions.length > 0 && (
            <div className="flex gap-1 px-3 py-2 border-b overflow-x-auto" style={{ borderColor: "var(--border)", scrollbarWidth: "none" }}>
              {sessions.map(session => {
                const isActive = session.id === activeSession?.id;
                return (
                  <button
                    key={session.id}
                    onClick={() => setActiveSessionId(session.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl flex-shrink-0 transition-colors"
                    style={{
                      backgroundColor: isActive ? "var(--terminal-bg)" : "var(--card)",
                      color: isActive ? "var(--terminal-fg)" : "var(--muted-foreground)",
                      fontSize: 12,
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: session.status === "connected" ? "var(--online)" : "var(--muted-foreground)" }} />
                    {session.connection?.name || "SSH"}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
            style={{ backgroundColor: "var(--terminal-bg)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {activeConnection ? (
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeStatus === "connected" ? "var(--online)" : activeStatus === "connecting" ? "var(--primary)" : "var(--terminal-red)" }} />
                  <span style={{ fontSize: 12, color: "rgba(226,232,240,0.7)", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeConnection.username}@{activeConnection.host}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "rgba(226,232,240,0.35)" }}>|</span>
                <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>
                  SSH · Port {activeConnection.port} · {activeStatus}
                </span>
              </div>
            ) : <div />}
            <div className="flex items-center gap-1">
              {(activeSession ? [
                { icon: Copy, title: t("commonCopy"), action: () => navigator.clipboard?.writeText(getActiveTerminalSelection(activeSession.id)) },
                { icon: Download, title: t("terminalDownloadLog") },
                { icon: RotateCcw, title: t("terminalReconnect"), action: restartActiveSession },
                { icon: isFullscreen ? Minimize2 : Maximize2, title: t("terminalFullscreen"), action: () => setIsFullscreen(f => !f) },
                { icon: X, title: t("terminalCloseSession"), action: () => requestCloseSession(activeSession.id) },
              ] : [
                { icon: isFullscreen ? Minimize2 : Maximize2, title: t("terminalFullscreen"), action: () => setIsFullscreen(f => !f) },
              ]).map(btn => (
                <button key={btn.title} onClick={btn.action}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "rgba(226,232,240,0.5)" }}
                  title={btn.title}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.07)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                  <btn.icon size={13} />
                </button>
              ))}
              {isFullscreen && (
                <button onClick={() => setIsFullscreen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "rgba(226,232,240,0.5)" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden" style={{ backgroundColor: "var(--terminal-bg)" }}>
            {sessions.map(session => (
              <TerminalSessionPane
                key={session.id}
                session={session}
                active={session.id === activeSession?.id}
                settings={settings}
                credentialsRef={credentialsRef}
                onPatch={patchSession}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>

      {confirmingClose && (
        <TerminalCloseDialog
          connectionName={sessions.find(session => session.id === confirmingClose)?.connection?.name || "SSH"}
          onCancel={() => setConfirmingClose(null)}
          onConfirm={() => {
            const sessionId = confirmingClose;
            setConfirmingClose(null);
            closeSession(sessionId);
          }}
          t={t}
        />
      )}
    </div>
  );
}

function TerminalSessionPane({
  session,
  active,
  settings,
  credentialsRef,
  onPatch,
  t,
}: {
  session: TerminalSessionView;
  active: boolean;
  settings: AppSettings;
  credentialsRef: MutableRefObject<Record<string, TerminalCredentials>>;
  onPatch: (sessionId: string, patch: TerminalSessionPatch) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const backendSessionIdRef = useRef<string | undefined>();
  const connectionRef = useRef<Connection | null>(session.connection);
  const reconnectTimerRef = useRef<number | undefined>();
  const mockInputEnabledRef = useRef(false);
  const mockInputRef = useRef("");
  const onPatchRef = useRef(onPatch);
  const [terminalReady, setTerminalReady] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [credentialPrompt, setCredentialPrompt] = useState<TerminalCredentialPrompt | null>(null);

  onPatchRef.current = onPatch;

  const patch = (patchValue: TerminalSessionPatch) => {
    onPatchRef.current(session.id, patchValue);
  };

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminalTheme = getTerminalTheme(settings.terminalTheme);
    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: terminalFontStack(settings.terminalFontFamily),
      fontSize: settings.terminalFontSize,
      lineHeight: 1.3,
      scrollback: 10000,
      theme: {
        background: terminalTheme.bg,
        foreground: terminalTheme.fg,
        cursor: terminalTheme.fg,
        green: terminalTheme.accent,
        red: readCssVar("--terminal-red", "#f87171"),
        blue: terminalTheme.accent,
        cyan: terminalTheme.accent,
        yellow: readCssVar("--terminal-yellow", "#fbbf24"),
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    registerTerminalForCopy(session.id, term);

    const fit = () => fitTerminal(fitAddon);
    const dataDisposable = term.onData(data => {
      const backendSessionId = backendSessionIdRef.current;
      if (backendSessionId && isTauriRuntime()) {
        void writeTerminalSession(backendSessionId, data);
      } else if (mockInputEnabledRef.current) {
        writeMockInput(term, mockInputRef, data, t);
      }
    });

    window.addEventListener("resize", fit);
    requestAnimationFrame(fit);
    setTerminalReady(true);

    return () => {
      window.removeEventListener("resize", fit);
      dataDisposable.dispose();
      const backendSessionId = backendSessionIdRef.current;
      backendSessionIdRef.current = undefined;
      if (backendSessionId) {
        void stopTerminalSession(backendSessionId);
      }
      unregisterTerminalForCopy(session.id);
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    const terminalTheme = getTerminalTheme(settings.terminalTheme);
    term.options.fontFamily = terminalFontStack(settings.terminalFontFamily);
    term.options.fontSize = settings.terminalFontSize;
    term.options.theme = {
      background: terminalTheme.bg,
      foreground: terminalTheme.fg,
      cursor: terminalTheme.fg,
      green: terminalTheme.accent,
      red: readCssVar("--terminal-red", "#f87171"),
      blue: terminalTheme.accent,
      cyan: terminalTheme.accent,
      yellow: readCssVar("--terminal-yellow", "#fbbf24"),
    };
    requestAnimationFrame(() => fitTerminal(fitAddonRef.current));
  }, [settings.terminalFontFamily, settings.terminalFontSize, settings.terminalTheme]);

  useEffect(() => {
    if (!terminalReady || !terminalRef.current) return;

    let cancelled = false;
    let createdBackendSessionId: string | undefined;
    const term = terminalRef.current;
    const previousBackendSessionId = backendSessionIdRef.current;
    backendSessionIdRef.current = undefined;
    if (previousBackendSessionId) {
      void stopTerminalSession(previousBackendSessionId);
    }
    term.reset();
    mockInputEnabledRef.current = false;
    mockInputRef.current = "";
    setCredentialPrompt(null);
    patch({ status: "connecting", error: "" });

    async function connectTerminal() {
      const nextConnection = await getConnection(session.connectionId);
      if (cancelled) return;

      connectionRef.current = nextConnection;
      patch({ connection: nextConnection, error: "" });

      if (!isTauriRuntime()) {
        mockInputEnabledRef.current = true;
        patch({ status: "connected" });
        writeMockBanner(term, nextConnection, t);
        return;
      }

      term.writeln(t("terminalConnecting", { target: `${nextConnection.username}@${nextConnection.host}:${nextConnection.port}` }));
      const credentials = credentialsRef.current[nextConnection.id] || {};
      const backendSession = await startTerminalSession(
        nextConnection.id,
        term.cols || 120,
        term.rows || 32,
        {
          password: credentials.password,
          passphrase: credentials.passphrase,
          keepAlive: settings.keepAlive,
          keepAliveInterval: settings.keepAliveInterval,
        },
      );
      if (cancelled) {
        await stopTerminalSession(backendSession.id);
        return;
      }
      createdBackendSessionId = backendSession.id;
      backendSessionIdRef.current = backendSession.id;
    }

    connectTerminal().catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      patch({ status: "disconnected", error: message });
      term.writeln(message);
      const currentConnection = connectionRef.current;
      const prompt = currentConnection ? buildCredentialPrompt(currentConnection, message) : null;
      if (prompt) {
        setCredentialPrompt(prompt);
      }
    });

    return () => {
      cancelled = true;
      mockInputEnabledRef.current = false;
      backendSessionIdRef.current = undefined;
      if (createdBackendSessionId) {
        void stopTerminalSession(createdBackendSessionId);
      }
    };
  }, [
    session.connectionId,
    session.id,
    session.restartToken,
    retryToken,
    settings.keepAlive,
    settings.keepAliveInterval,
    terminalReady,
  ]);

  useEffect(() => {
    if (!terminalReady) return;

    let outputUnlisten: (() => void) | undefined;
    let connectedUnlisten: (() => void) | undefined;
    let exitUnlisten: (() => void) | undefined;
    let cancelled = false;

    async function subscribe() {
      outputUnlisten = await onTerminalOutput(event => {
        if (event.payload.sessionId === backendSessionIdRef.current) {
          terminalRef.current?.write(event.payload.data);
        }
      });
      connectedUnlisten = await onTerminalConnected(event => {
        if (event.payload.sessionId !== backendSessionIdRef.current) return;

        patch({ status: "connected", error: "" });
        const activeConnection = connectionRef.current;
        const password = activeConnection ? credentialsRef.current[activeConnection.id]?.password : undefined;
        if (activeConnection?.authType === "password" && password) {
          void saveConnectionPassword(activeConnection.id, password).catch(err => {
            patch({ error: err instanceof Error ? err.message : String(err) });
          });
        }
      });
      exitUnlisten = await onTerminalExit(event => {
        if (event.payload.sessionId !== backendSessionIdRef.current) return;

        patch({ status: "disconnected", error: event.payload.message });
        terminalRef.current?.writeln(`\r\n${event.payload.message}`);
        const activeConnection = connectionRef.current;
        const prompt = activeConnection ? buildCredentialPrompt(activeConnection, event.payload.message) : null;
        if (prompt) {
          setCredentialPrompt(prompt);
          return;
        }
        if (settings.autoReconnect) {
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = undefined;
            setRetryToken(token => token + 1);
          }, 1500);
        }
      });

      if (cancelled) {
        outputUnlisten();
        connectedUnlisten();
        exitUnlisten();
      }
    }

    void subscribe();
    return () => {
      cancelled = true;
      outputUnlisten?.();
      connectedUnlisten?.();
      exitUnlisten?.();
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
    };
  }, [session.id, settings.autoReconnect, terminalReady]);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      fitTerminal(fitAddonRef.current);
      terminalRef.current?.focus();
    });
  }, [active, settings.terminalFontSize]);

  return (
    <div className={active ? "h-full flex flex-col" : "hidden h-full"}>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ backgroundColor: "var(--terminal-bg)", padding: 12 }}
      />
      {session.connection && session.status === "disconnected" && (
        <div className="px-4 py-2 flex items-center gap-2"
          style={{ backgroundColor: "var(--terminal-bg)", color: "rgba(226,232,240,0.55)", fontSize: 12 }}>
          <WifiOff size={13} />
          {t("terminalDisconnected")}
        </div>
      )}
      {credentialPrompt && (
        <TerminalCredentialDialog
          prompt={credentialPrompt}
          onCancel={() => setCredentialPrompt(null)}
          onSubmit={value => {
            const current = credentialsRef.current[credentialPrompt.connection.id] || {};
            credentialsRef.current[credentialPrompt.connection.id] = {
              ...current,
              [credentialPrompt.kind]: value,
            };
            patch({ error: "" });
            setCredentialPrompt(null);
            setRetryToken(token => token + 1);
          }}
          t={t}
        />
      )}
    </div>
  );
}

const terminalCopyRegistry = new Map<string, XTerm>();

function registerTerminalForCopy(sessionId: string, term: XTerm) {
  terminalCopyRegistry.set(sessionId, term);
}

function unregisterTerminalForCopy(sessionId: string) {
  terminalCopyRegistry.delete(sessionId);
}

function getActiveTerminalSelection(sessionId: string) {
  return terminalCopyRegistry.get(sessionId)?.getSelection() || "";
}

function fitTerminal(fitAddon: FitAddon | null) {
  if (!fitAddon) return;
  try {
    fitAddon.fit();
  } catch {
    // xterm can race layout during first paint or hidden-tab activation.
  }
}

function terminalFontStack(fontFamily: string) {
  return `'${fontFamily}', Menlo, Consolas, monospace`;
}

function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function buildCredentialPrompt(connection: Connection, message: string): TerminalCredentialPrompt | null {
  const lower = message.toLowerCase();
  if (connection.authType === "password") {
    const needsPassword =
      lower.includes("password")
      || lower.includes("credentials required")
      || lower.includes("authentication failed");
    return needsPassword ? { kind: "password", connection, message } : null;
  }

  if (connection.authType === "key") {
    const needsPassphrase =
      lower.includes("passphrase")
      || lower.includes("public key")
      || lower.includes("private key")
      || lower.includes("callback returned error")
      || lower.includes("credentials required")
      || lower.includes("authentication failed");
    return needsPassphrase ? { kind: "passphrase", connection, message } : null;
  }

  return null;
}

function TerminalCredentialDialog({
  prompt,
  onCancel,
  onSubmit,
  t,
}: {
  prompt: TerminalCredentialPrompt;
  onCancel: () => void;
  onSubmit: (value: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [value, setValue] = useState("");
  const titleKey = prompt.kind === "password" ? "terminalCredentialPasswordTitle" : "terminalCredentialPassphraseTitle";
  const placeholderKey = prompt.kind === "password" ? "terminalCredentialPasswordPlaceholder" : "terminalCredentialPassphrasePlaceholder";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      onClick={onCancel}
    >
      <form
        className="w-full max-w-[460px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        onClick={event => event.stopPropagation()}
        onSubmit={event => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
            {t(titleKey)}
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.55 }}>
            {t(prompt.kind === "password" ? "terminalCredentialPasswordMessage" : "terminalCredentialMessage", { name: prompt.connection.name })}
          </p>
          <p style={{ fontSize: 12, color: "var(--destructive)", marginTop: 10, lineHeight: 1.5, wordBreak: "break-word" }}>
            {prompt.message}
          </p>
        </div>
        <div className="p-5">
          <input
            autoFocus
            type="password"
            value={value}
            onChange={event => setValue(event.target.value)}
            placeholder={t(placeholderKey)}
            className="w-full h-12 px-4 rounded-2xl border outline-none"
            style={{
              backgroundColor: "var(--input-background)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
            }}
          />
          {prompt.kind === "passphrase" && (
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 10, lineHeight: 1.5 }}>
              {t("terminalCredentialKeyHint")}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 pt-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", fontSize: 13 }}
          >
            {t("commonCancel")}
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-white"
            style={{ backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}
          >
            {t("terminalCredentialSubmit")}
          </button>
        </div>
      </form>
    </div>
  );
}

function TerminalCloseDialog({
  connectionName,
  onCancel,
  onConfirm,
  t,
}: {
  connectionName: string;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[420px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        onClick={event => event.stopPropagation()}
      >
        <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
            {t("terminalCloseConfirmTitle")}
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.55 }}>
            {t("terminalCloseConfirmMessage", { name: connectionName })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 p-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", fontSize: 13 }}
          >
            {t("commonCancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-white"
            style={{ backgroundColor: "var(--destructive)", fontSize: 13, fontWeight: 500 }}
          >
            {t("terminalCloseSession")}
          </button>
        </div>
      </div>
    </div>
  );
}

function writeMockBanner(term: XTerm, connection: Connection, t: (key: string, params?: Record<string, string | number>) => string) {
  term.writeln(t("terminalPreviewConnected", { name: connection.name }));
  term.writeln(t("terminalPreviewCommands"));
  term.write(`\r\n${connection.username}@${connection.name}:~$ `);
}

function writeMockInput(
  term: XTerm,
  inputRef: MutableRefObject<string>,
  data: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  for (const char of data) {
    if (char === "\r") {
      const command = inputRef.current.trim();
      term.write("\r\n");
      runMockCommand(term, command, t);
      inputRef.current = "";
      term.write("demo@sshcr:~$ ");
    } else if (char === "\u007f") {
      if (inputRef.current.length > 0) {
        inputRef.current = inputRef.current.slice(0, -1);
        term.write("\b \b");
      }
    } else if (char === "\u0003") {
      inputRef.current = "";
      term.write("^C\r\ndemo@sshcr:~$ ");
    } else if (char >= " ") {
      inputRef.current += char;
      term.write(char);
    }
  }
}

function runMockCommand(
  term: XTerm,
  command: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (!command) return;
  if (command === "clear") {
    term.clear();
    return;
  }
  if (command === "exit") {
    term.writeln(t("terminalSessionClosed"));
    return;
  }
  if (command === "pwd") {
    term.writeln("/home/demo");
    return;
  }
  if (command === "ls") {
    term.writeln("deploy.sh  projects  logs  .ssh");
    return;
  }
  if (command === "help") {
    term.writeln(t("terminalPreviewHelp"));
    return;
  }
  term.writeln(t("terminalCommandNotFound", { command }));
}
