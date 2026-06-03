import { useEffect, useMemo, useState } from "react";
import {
  Server, Search, Star, Clock, SlidersHorizontal, Plus,
  MoreHorizontal, Terminal, FolderOpen, Pencil, Trash2, Copy,
  X
} from "lucide-react";
import { createConnection, deleteConnection, listConnections } from "../../lib/api";
import type { Connection } from "../../lib/types";
import { useI18n } from "../../lib/i18n";
import { NewConnectionModal } from "../NewConnectionModal";

interface ConnectionsProps {
  onOpenNewConnection: () => void;
  onNavigate: (page: string, extra?: any) => void;
  isMobile: boolean;
  refreshToken: number;
  filters: ConnectionFilters;
  onFiltersChange: (patch: Partial<ConnectionFilters>) => void;
}

export interface ConnectionFilters {
  search: string;
  activeTag: string;
  statusFilter: string;
}

export function Connections({ onOpenNewConnection, onNavigate, isMobile, refreshToken, filters, onFiltersChange }: ConnectionsProps) {
  const { t } = useI18n();
  const { search, activeTag, statusFilter } = filters;
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [deletingConnection, setDeletingConnection] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listConnections()
      .then(items => {
        setConnections(items);
        setError("");
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, [refreshToken]);

  const allTags = useMemo(() => {
    const tags = Array.from(new Set(connections.flatMap(connection => connection.tags))).sort();
    if (!["all", "favorites"].includes(activeTag) && activeTag && !tags.includes(activeTag)) {
      tags.unshift(activeTag);
    }
    return ["all", "favorites", ...tags];
  }, [activeTag, connections]);

  const filtered = connections.filter(c => {
    const query = search.toLowerCase();
    const matchSearch = !query || c.name.toLowerCase().includes(query) || c.host.toLowerCase().includes(query) || c.username.toLowerCase().includes(query);
    const matchTag = activeTag === "all" ? true : activeTag === "favorites" ? c.favorite : c.tags.includes(activeTag);
    const matchStatus = statusFilter === "all" ? true : statusFilter === "online" ? Boolean(c.lastConnectedAt) : !c.lastConnectedAt;
    return matchSearch && matchTag && matchStatus;
  });

  const refreshConnections = () => {
    listConnections()
      .then(items => {
        setConnections(items);
        setError("");
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  };

  const requestDelete = (connection: Connection) => {
    setDeletingConnection(connection);
    setDeleteError("");
    setOpenMenu(null);
  };

  const confirmDelete = async () => {
    if (!deletingConnection) return;
    setDeleting(true);
    setDeleteError("");
    setError("");
    try {
      await deleteConnection(deletingConnection.id);
      setDeletingConnection(null);
      refreshConnections();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteError(message);
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (connection: Connection) => {
    try {
      await createConnection({
        name: `${connection.name} copy`,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        authType: connection.authType,
        keyPath: connection.keyPath || undefined,
        keyAlias: connection.keyAlias || undefined,
        favorite: connection.favorite,
        tags: connection.tags,
        notes: connection.notes,
      });
      setOpenMenu(null);
      refreshConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="p-5 lg:p-7 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--foreground)" }}>{t("connectionsTitle")}</h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
              {t("connectionsCount", { shown: filtered.length, total: connections.length })}
            </p>
          </div>
          <button
            onClick={onOpenNewConnection}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}
          >
            <Plus size={15} />
            {!isMobile && t("connectionsAddHost")}
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-xl border"
            style={{ fontSize: 12, color: "var(--destructive)", borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            {error}
          </div>
        )}

        {/* Search + Filters */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
              <Search size={14} style={{ color: "var(--muted-foreground)" }} />
              <input
                value={search}
                onChange={e => onFiltersChange({ search: e.target.value })}
                placeholder={t("connectionsSearchPlaceholder")}
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 13, color: "var(--foreground)" }}
              />
              {search && (
                <button onClick={() => onFiltersChange({ search: "" })}>
                  <X size={13} style={{ color: "var(--muted-foreground)" }} />
                </button>
              )}
            </div>
            <button
              onClick={() => onFiltersChange({
                statusFilter: statusFilter === "all" ? "online" : statusFilter === "online" ? "offline" : "all",
              })}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border transition-colors"
              style={{
                backgroundColor: statusFilter === "all" ? "var(--card)" : "var(--accent)",
                borderColor: statusFilter === "all" ? "var(--border)" : "var(--primary)",
                fontSize: 13,
                color: statusFilter === "all" ? "var(--foreground)" : "var(--primary)",
              }}
            >
              <SlidersHorizontal size={14} />
              {!isMobile && <span>{statusFilter === "all" ? t("connectionsFilter") : statusFilter === "online" ? t("connectionsOnline") : t("connectionsOffline")}</span>}
            </button>
          </div>

          {/* Tag pills */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => onFiltersChange({ activeTag: tag })}
                className="flex-shrink-0 px-3 py-1 rounded-lg transition-all"
                style={{
                  fontSize: 12,
                  fontWeight: activeTag === tag ? 500 : 400,
                  backgroundColor: activeTag === tag ? "var(--primary)" : "var(--muted)",
                  color: activeTag === tag ? "#fff" : "var(--muted-foreground)",
                }}
              >
                {tag === "favorites" && <Star size={10} className="inline mr-1" fill="currentColor" />}
                {formatTag(tag, t)}
              </button>
            ))}
          </div>
        </div>

        {/* Connection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(conn => (
            <div
              key={conn.id}
              onMouseEnter={() => setHoveredCard(conn.id)}
              onMouseLeave={() => setHoveredCard(null)}
              onDoubleClick={() => onNavigate("terminal", { connectionId: conn.id })}
              className="rounded-2xl border p-4 transition-all cursor-pointer"
              style={{
                backgroundColor: "var(--card)",
                borderColor: hoveredCard === conn.id ? "var(--primary)" : "var(--border)",
                boxShadow: hoveredCard === conn.id ? "0 4px 24px rgba(37,99,235,0.1)" : "none",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: conn.lastConnectedAt ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.08)" }}>
                    <Server size={16} style={{ color: conn.lastConnectedAt ? "var(--online)" : "var(--muted-foreground)" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--card-foreground)" }}>{conn.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" }}>
                      {conn.username}@{conn.host}:{conn.port}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {conn.favorite && <Star size={12} fill="currentColor" style={{ color: "#f59e0b" }} />}
                  <div className="relative">
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === conn.id ? null : conn.id); }}
                      className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                      style={{ color: "var(--muted-foreground)" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--muted)")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {openMenu === conn.id && (
                      <div className="absolute right-0 top-7 z-50 rounded-xl border shadow-lg py-1 min-w-[150px]"
                        style={{ backgroundColor: "var(--popover)", borderColor: "var(--border)" }}>
                        {[
                          { icon: Terminal, label: t("connectionsOpenSsh"), action: () => onNavigate("terminal", { connectionId: conn.id }) },
                          { icon: FolderOpen, label: t("connectionsOpenSftp"), action: () => onNavigate("files", { connectionId: conn.id }) },
                          { icon: Pencil, label: t("connectionsEdit"), action: () => setEditingConnection(conn) },
                          { icon: Copy, label: t("connectionsDuplicate"), action: () => void handleDuplicate(conn) },
                          { icon: Trash2, label: t("commonDelete"), danger: true, action: () => requestDelete(conn) },
                        ].map(item => (
                          <button key={item.label}
                            onClick={e => {
                              e.stopPropagation();
                              setOpenMenu(null);
                              item.action?.();
                            }}
                            className="flex items-center gap-2.5 w-full px-3.5 py-2 transition-colors"
                            style={{
                              fontSize: 12,
                              color: item.danger ? "var(--destructive)" : "var(--foreground)",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--muted)")}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <item.icon size={13} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 mb-3">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: conn.lastConnectedAt ? "var(--online)" : "var(--muted-foreground)" }} />
                <span style={{ fontSize: 11, color: conn.lastConnectedAt ? "var(--online)" : "var(--muted-foreground)" }}>
                  {conn.lastConnectedAt ? t("commonReady") : t("commonSaved")}
                </span>
                <span style={{ color: "var(--border)", margin: "0 2px" }}>·</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{conn.os || conn.authType}</span>
                <span style={{ color: "var(--border)", margin: "0 2px" }}>·</span>
                <Clock size={10} style={{ color: "var(--muted-foreground)" }} />
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{formatLastSeen(conn.lastConnectedAt, t)}</span>
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
                <div className="flex gap-1.5">
                  <button
                    onClick={e => { e.stopPropagation(); onNavigate("terminal", { connectionId: conn.id }); }}
                    className="px-2.5 py-1 rounded-lg transition-colors"
                    style={{ fontSize: 11, backgroundColor: "var(--accent)", color: "var(--primary)" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                  >
                    SSH
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onNavigate("files", { connectionId: conn.id }); }}
                    className="px-2.5 py-1 rounded-lg transition-colors"
                    style={{ fontSize: 11, backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                  >
                    SFTP
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
            <Server size={32} style={{ color: "var(--muted-foreground)", opacity: 0.4, marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{t("connectionsNoFound")}</p>
            <button onClick={onOpenNewConnection}
              className="mt-4 px-4 py-2 rounded-xl text-white"
              style={{ backgroundColor: "var(--primary)", fontSize: 13 }}>
              {t("connectionsAddFirst")}
            </button>
          </div>
        )}
      </div>
      {editingConnection && (
        <NewConnectionModal
          connection={editingConnection}
          onClose={() => setEditingConnection(null)}
          onSaved={() => {
            setEditingConnection(null);
            refreshConnections();
          }}
        />
      )}
      {deletingConnection && (
        <ConnectionDeleteDialog
          connection={deletingConnection}
          deleting={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) {
              setDeletingConnection(null);
              setDeleteError("");
            }
          }}
          onConfirm={() => void confirmDelete()}
          t={t}
        />
      )}
    </div>
  );
}

function ConnectionDeleteDialog({
  connection,
  deleting,
  error,
  onCancel,
  onConfirm,
  t,
}: {
  connection: Connection;
  deleting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[430px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "var(--destructive)" }}
          >
            <Trash2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
              {t("connectionsDeleteTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.55 }}>
              {t("connectionsDeleteMessage", { name: connection.name })}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
            style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4">
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{connection.name}</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                marginTop: 4,
              }}
            >
              {connection.username}@{connection.host}:{connection.port}
            </div>
          </div>
          {error && (
            <div
              className="mt-3 rounded-2xl border px-4 py-3"
              style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "var(--destructive)", fontSize: 12 }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 pt-1">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-xl border transition-colors disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", fontSize: 13 }}
          >
            {t("commonCancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-white transition-all disabled:opacity-60 active:scale-95"
            style={{ backgroundColor: "var(--destructive)", fontSize: 13, fontWeight: 500 }}
          >
            {deleting ? t("connectionsDeleting") : t("commonDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatLastSeen(value: string | null | undefined, t: (key: string) => string) {
  if (!value) return t("commonNever");
  return value.includes("T") ? value.split("T")[0] : value.split(" ")[0];
}

function formatTag(tag: string, t: (key: string) => string) {
  if (tag === "all") return t("connectionsAll");
  if (tag === "favorites") return t("connectionsFavorites");
  return tag;
}
