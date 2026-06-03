import { useEffect, useState } from "react";
import {
  Server, Wifi, Clock, HardDrive, Plus, Star, ArrowRight,
  Activity, Upload, Download, Terminal, FolderOpen,
  Shield, ChevronRight
} from "lucide-react";
import { dashboardSummary } from "../../lib/api";
import type { Activity as ActivityItem, DashboardSummary } from "../../lib/types";
import { useI18n } from "../../lib/i18n";

interface DashboardProps {
  onNavigate: (page: string) => void;
  onOpenNewConnection: () => void;
  isMobile: boolean;
  refreshToken: number;
}

export function Dashboard({ onNavigate, onOpenNewConnection, isMobile, refreshToken }: DashboardProps) {
  const { language, t } = useI18n();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const dashboardDate = formatDashboardDate(language);

  useEffect(() => {
    dashboardSummary()
      .then(value => {
        setSummary(value);
        setError("");
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, [refreshToken]);

  const visibleConnections = summary?.recentConnections || [];
  const visibleActivity = summary?.recentActivity || [];
  const liveStats = [
    { label: t("dashboardTotalHosts"), value: String(summary?.totalHosts ?? 0), sub: t("dashboardSavedProfiles"), icon: Server, color: "#2563eb", bg: "#eff6ff" },
    { label: t("dashboardActiveSessions"), value: String(summary?.activeSessions ?? 0), sub: t("dashboardSshShells"), icon: Activity, color: "#10b981", bg: "#ecfdf5" },
    { label: t("dashboardTransfersToday"), value: String(summary?.transfersToday ?? 0), sub: formatBytes(summary?.transferBytesToday || 0), icon: HardDrive, color: "#8b5cf6", bg: "#f5f3ff" },
    // Backend storage is internal for now, so keep this card hidden from the dashboard.
    // { label: t("dashboardBackend"), value: "SQLite", sub: t("dashboardLocalFirst"), icon: TrendingUp, color: "#f59e0b", bg: "#fffbeb" },
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="p-5 lg:p-7 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-foreground" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}>{t("dashboardTitle")}</h1>
            <p style={{ fontSize: 13 }} className="text-muted-foreground mt-0.5">{t("dashboardSubtitle", { date: dashboardDate, count: summary?.activeSessions ?? 0 })}</p>
          </div>
          <button
            onClick={onOpenNewConnection}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}
          >
            <Plus size={15} />
            {!isMobile && t("dashboardNewConnection")}
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-xl border"
            style={{ fontSize: 12, color: "var(--destructive)", borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {liveStats.map((stat) => (
            <div key={stat.label} className="rounded-2xl p-4 border transition-shadow hover:shadow-md"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: stat.bg }}>
                  <stat.icon size={17} style={{ color: stat.color }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }} className="mt-1">{stat.sub}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, color: "var(--card-foreground)", lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Recent Connections */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{t("dashboardRecentConnections")}</h2>
              <button onClick={() => onNavigate("connections")}
                className="flex items-center gap-1 transition-colors hover:text-foreground"
                style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                {t("dashboardViewAll")} <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleConnections.map((conn) => (
                <div
                  key={conn.id}
                  onMouseEnter={() => setHoveredCard(conn.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  onClick={() => onNavigate("connections")}
                  className="rounded-2xl p-4 border cursor-pointer transition-all"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: hoveredCard === conn.id ? "var(--primary)" : "var(--border)",
                    boxShadow: hoveredCard === conn.id ? "0 4px 20px rgba(37,99,235,0.12)" : "none",
                  }}
                >
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: conn.lastConnectedAt ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)" }}>
                        <Server size={15} style={{ color: conn.lastConnectedAt ? "var(--online)" : "var(--muted-foreground)" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--card-foreground)" }}>{conn.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{conn.username}@{conn.host}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {conn.favorite && <Star size={12} fill="currentColor" style={{ color: "#f59e0b" }} />}
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: conn.lastConnectedAt ? "var(--online)" : "var(--muted-foreground)" }} />
                        <span style={{ fontSize: 10, color: conn.lastConnectedAt ? "var(--online)" : "var(--muted-foreground)" }}>
                          {conn.lastConnectedAt ? t("commonReady") : t("commonSaved")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 flex-wrap">
                      {conn.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-lg"
                          style={{ fontSize: 10, backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                      <Clock size={10} className="inline mr-1" />{formatLastSeen(conn.lastConnectedAt, t)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel: Activity + Quick Actions */}
          <div className="flex flex-col gap-4">
            {/* Quick Actions */}
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 12 }}>{t("dashboardQuickActions")}</h2>
              <div className="flex flex-col gap-2">
                {[
                  { label: t("dashboardOpenTerminal"), icon: Terminal, page: "terminal", color: "#2563eb" },
                  { label: t("dashboardBrowseFiles"), icon: FolderOpen, page: "files", color: "#8b5cf6" },
                  { label: t("dashboardManageKeys"), icon: Shield, page: "keys", color: "#10b981" },
                  { label: t("dashboardNewConnection"), icon: Plus, action: onOpenNewConnection, color: "#f59e0b" },
                ].map((action) => (
                  <button
                    key={action.label}
                    onClick={() => action.action ? action.action() : onNavigate(action.page!)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors group"
                    style={{ backgroundColor: "var(--muted)" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "var(--muted)")}
                  >
                    <div className="flex items-center gap-2.5">
                      <action.icon size={14} style={{ color: action.color }} />
                      <span style={{ fontSize: 13, color: "var(--foreground)" }}>{action.label}</span>
                    </div>
                    <ArrowRight size={13} style={{ color: "var(--muted-foreground)" }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Activity Feed */}
            <div className="rounded-2xl p-4 border" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 12 }}>{t("dashboardRecentActivity")}</h2>
              <div className="flex flex-col gap-3">
                {visibleActivity.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{t("dashboardNoActivity")}</div>
                )}
                {visibleActivity.map((act) => {
                  const meta = activityMeta(act.kind, t);
                  return (
                    <div key={act.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "var(--muted)" }}>
                        <meta.icon size={13} style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
                          {formatActivityDetail(act, t) || meta.label}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                          {act.connectionName || t("commonLocal")}{act.bytes ? ` · ${formatBytes(act.bytes)}` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)", flexShrink: 0 }}>{formatLastSeen(act.createdAt, t)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatLastSeen(value: string | null | undefined, t: (key: string) => string) {
  if (!value) return t("commonNever");
  if (value.includes("ago")) return value;
  return value.includes("T") ? value.split("T")[0] : value.split(" ")[0];
}

function formatDashboardDate(language: string) {
  const today = new Date();
  if (language === "zh-CN") {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      weekday: "long",
    }).formatToParts(today);
    const month = parts.find(part => part.type === "month")?.value || String(today.getMonth() + 1);
    const day = parts.find(part => part.type === "day")?.value || String(today.getDate());
    const weekday = parts.find(part => part.type === "weekday")?.value || new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(today);
    return `${month} 月 ${day} 日，${weekday}`;
  }
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(today);
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function activityMeta(kind: string, t: (key: string) => string) {
  if (kind === "upload") return { icon: Upload, color: "#10b981", label: t("activityUploaded") };
  if (kind === "download") return { icon: Download, color: "#8b5cf6", label: t("activityDownloaded") };
  if (kind === "disconnect") return { icon: Wifi, color: "#f59e0b", label: t("activityDisconnected") };
  return { icon: Terminal, color: "#2563eb", label: t("activityConnected") };
}

function formatActivityDetail(act: ActivityItem, t: (key: string, params?: Record<string, string | number>) => string) {
  if (act.kind === "upload") return t("activityUploadedDetail", { name: fileFromDetail(act.detail, "Uploaded") || "file" });
  if (act.kind === "download") return t("activityDownloadedDetail", { name: fileFromDetail(act.detail, "Downloaded") || "file" });
  if (act.kind === "connect") return t("activitySshOpened");
  return act.detail || "";
}

function fileFromDetail(detail: string | null | undefined, prefix: string) {
  if (!detail) return "";
  return detail.replace(new RegExp(`^${prefix}\\s+`), "");
}
