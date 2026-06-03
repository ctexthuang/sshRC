import { useEffect, useState, type DragEvent } from "react";
import {
  Folder, FolderOpen, File, FileText, FileCode, Image, Archive,
  ChevronRight, Upload, Download, Plus, Trash2,
  RefreshCw, Search, Grid, List, X,
  HardDrive, ArrowUp, Home, SortAsc
} from "lucide-react";
import {
  createSftpDirectory,
  deleteSftpPaths,
  downloadSftpFile,
  isTauriRuntime,
  listSftpDirectory,
  uploadSftpFile,
} from "../../lib/api";
import type { Connection, RemoteFileEntry } from "../../lib/types";
import { useI18n } from "../../lib/i18n";

interface FileEntry {
  name: string;
  type: "dir" | "file";
  path: string;
  size?: number;
  modified: string;
  permissions: string;
  ext?: string;
}

interface TransferItem {
  id: string;
  name: string;
  direction: "up" | "down";
  progress: number;
  size: string;
}

type FileDialog =
  | { type: "mkdir" }
  | { type: "upload" }
  | { type: "download"; files: FileEntry[] }
  | { type: "delete"; files: FileEntry[] };

function formatSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ ext, type }: { ext?: string; type: "dir" | "file" }) {
  if (type === "dir") return <Folder size={15} style={{ color: "#f59e0b" }} />;
  if (["js", "ts", "tsx", "jsx", "py", "sh", "css", "html"].includes(ext || ""))
    return <FileCode size={15} style={{ color: "#3b82f6" }} />;
  if (["png", "jpg", "jpeg", "gif", "svg", "ico"].includes(ext || ""))
    return <Image size={15} style={{ color: "#8b5cf6" }} />;
  if (["gz", "zip", "tar", "bz2"].includes(ext || ""))
    return <Archive size={15} style={{ color: "#f59e0b" }} />;
  if (["txt", "md", "log"].includes(ext || ""))
    return <FileText size={15} style={{ color: "#6b7280" }} />;
  return <File size={15} style={{ color: "#6b7280" }} />;
}

function DirectoryTree({
  currentPath,
  directories,
  onSelect,
}: {
  currentPath: string;
  directories: FileEntry[];
  onSelect: (path: string) => void;
}) {
  const parts = currentPath.split("/").filter(Boolean);
  const ancestors = [
    { name: "/", path: "/" },
    ...parts.map((name, index) => ({
      name,
      path: `/${parts.slice(0, index + 1).join("/")}`,
    })),
  ];

  return (
    <div className="flex flex-col gap-1">
      {ancestors.map((item, index) => {
        const isActive = item.path === currentPath;
        return (
          <button
            key={item.path}
            onClick={() => onSelect(item.path)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-xl transition-colors text-left"
            style={{
              paddingLeft: `${8 + index * 10}px`,
              backgroundColor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--primary)" : "var(--sidebar-foreground)",
              fontSize: 13,
            }}
            onMouseEnter={event => { if (!isActive) event.currentTarget.style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={event => { if (!isActive) event.currentTarget.style.backgroundColor = "transparent"; }}
          >
            {isActive ? (
              <FolderOpen size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
            ) : (
              <Folder size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
            )}
            <span className="truncate">{item.name}</span>
          </button>
        );
      })}
      {directories.length > 0 && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          {directories.map(directory => (
            <button
              key={directory.path}
              onClick={() => onSelect(directory.path)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-xl transition-colors text-left"
              style={{
                paddingLeft: `${8 + ancestors.length * 10}px`,
                color: "var(--sidebar-foreground)",
                fontSize: 13,
              }}
              onMouseEnter={event => (event.currentTarget.style.backgroundColor = "var(--muted)")}
              onMouseLeave={event => (event.currentTarget.style.backgroundColor = "transparent")}
            >
              <Folder size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
              <span className="truncate">{directory.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileOperationDialog({
  dialog,
  value,
  onValueChange,
  onClose,
  onSubmit,
  busy,
  t,
}: {
  dialog: FileDialog;
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const isDelete = dialog.type === "delete";
  const title = dialog.type === "mkdir"
    ? t("filesNewFolder")
    : dialog.type === "upload"
      ? t("commonUpload")
      : dialog.type === "download"
        ? t("commonDownload")
        : t("commonDelete");
  const description = dialog.type === "mkdir"
    ? t("filesNewFolderPrompt")
    : dialog.type === "upload"
      ? t("filesUploadLocalPathPrompt")
      : dialog.type === "download"
        ? t(dialog.files.length === 1 ? "filesDownloadLocalPathPrompt" : "filesDownloadLocalFolderPrompt")
        : t("filesDeleteConfirm", { count: dialog.files.length });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.42)", backdropFilter: "blur(4px)" }}
      onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-[440px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>{title}</h2>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{description}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          {isDelete ? (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {dialog.files.map(file => (
                <div key={file.path} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
                  style={{ borderColor: "var(--border)" }}>
                  <FileIcon ext={file.ext} type={file.type} />
                  <span className="truncate" style={{ fontSize: 13, color: "var(--foreground)" }}>{file.path}</span>
                </div>
              ))}
            </div>
          ) : (
            <input
              value={value}
              onChange={event => onValueChange(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter") onSubmit(); }}
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl border outline-none"
              style={{
                fontSize: 13,
                fontFamily: dialog.type === "mkdir" ? "inherit" : "var(--font-mono, 'JetBrains Mono', monospace)",
                backgroundColor: "var(--input-background)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          )}
        </div>
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border"
            style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}>
            {t("commonCancel")}
          </button>
          <button onClick={onSubmit} disabled={busy} className="px-4 py-2 rounded-xl text-white"
            style={{
              fontSize: 13,
              backgroundColor: isDelete ? "var(--destructive)" : "var(--primary)",
              opacity: busy ? 0.6 : 1,
            }}>
            {title}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FileManagerProps {
  isMobile: boolean;
  connectionId?: string;
  connection?: Connection | null;
}

export function FileManager({ isMobile, connectionId, connection }: FileManagerProps) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState("/");
  const [selected, setSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [search, setSearch] = useState("");
  const [showTree, setShowTree] = useState(!isMobile);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileEntry[]>([]);
  const [loadError, setLoadError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [dialog, setDialog] = useState<FileDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [dragDepth, setDragDepth] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!connectionId && isTauriRuntime()) {
      setRemoteFiles([]);
      setLoadError(t("filesSelectConnection"));
      return;
    }

    listSftpDirectory(connectionId || "mock-prod-web-01", currentPath)
      .then(entries => {
        setRemoteFiles(entries);
        setSelected(previous => previous.filter(path => entries.some(entry => entry.path === path)));
        setLoadError("");
      })
      .catch(err => {
        setRemoteFiles([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [connectionId, currentPath, reloadToken, t]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(event => {
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setDragActive(true);
            return;
          }
          if (payload.type === "leave") {
            setDragActive(false);
            setDragDepth(0);
            return;
          }
          if (payload.type === "drop") {
            setDragActive(false);
            setDragDepth(0);
            void uploadDroppedPaths(payload.paths);
          }
        })
      )
      .then(cleanup => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : String(err)));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [connectionId, currentPath, t]);

  const allFiles = remoteFiles.map(toFileEntry);
  const files = allFiles.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );
  const currentDirectories = allFiles.filter(file => file.type === "dir");
  const selectedFiles = allFiles.filter(file => selected.includes(file.path));

  const pathParts = currentPath.split("/").filter(Boolean);
  const connectionName = connection?.name || (connectionId ? t("filesRemoteHost") : t("filesPreviewSftp"));
  const connectionAddress = connection
    ? `${connection.username}@${connection.host}:${connection.port}`
    : connectionId
      ? t("filesSftpSession")
      : t("commonPreview");

  const selectPath = (path: string) => {
    setCurrentPath(path);
    setSelected([]);
    setSearch("");
  };

  const goUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      selectPath("/" + parts.slice(0, -1).join("/") || "/");
    }
  };

  const toggleSelect = (path: string) => {
    setSelected(s => s.includes(path) ? s.filter(x => x !== path) : [...s, path]);
  };

  const activeConnectionId = () => {
    if (!connectionId && isTauriRuntime()) {
      setLoadError(t("filesSelectConnection"));
      return undefined;
    }
    return connectionId || "mock-prod-web-01";
  };

  const refresh = () => setReloadToken(token => token + 1);

  const runOperation = async (operation: () => Promise<void>) => {
    setBusy(true);
    setLoadError("");
    setOperationMessage("");
    try {
      await operation();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDirectory = () => {
    setDialogValue("new-folder");
    setDialog({ type: "mkdir" });
  };

  const handleUpload = () => {
    setDialogValue("");
    setDialog({ type: "upload" });
  };

  const uploadDroppedPaths = async (paths: string[]) => {
    const filePaths = paths.filter(Boolean);
    if (filePaths.length === 0) return;

    await runOperation(async () => {
      const id = activeConnectionId();
      if (!id) return;

      let uploaded = 0;
      for (const localPath of filePaths) {
        const name = basename(localPath);
        if (!name) continue;

        const transferId = addTransfer(name, "up");
        try {
          const result = await uploadSftpFile(id, localPath, joinRemotePath(currentPath, name));
          finishTransfer(transferId, result.bytes);
          uploaded += 1;
        } catch (err) {
          removeTransfer(transferId);
          throw err;
        }
      }

      setOperationMessage(t("filesDroppedUploadResult", { count: uploaded }));
      refresh();
    });
  };

  const uploadDroppedBrowserFiles = async (files: File[]) => {
    if (files.length === 0) return;
    await uploadDroppedPaths(files.map(file => file.name));
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragDepth(depth => depth + 1);
    setDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragDepth(depth => {
      const next = Math.max(0, depth - 1);
      if (next === 0) setDragActive(false);
      return next;
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragDepth(0);
    setDragActive(false);

    if (isTauriRuntime()) {
      return;
    }

    void uploadDroppedBrowserFiles(Array.from(event.dataTransfer.files));
  };

  const handleDownloadSelected = () => {
    const downloadable = selectedFiles.filter(file => file.type === "file");
    if (downloadable.length === 0) {
      setLoadError(t("filesDownloadFilesOnly"));
      return;
    }

    setDialogValue(
      downloadable.length === 1 ? `~/Downloads/${downloadable[0].name}` : "~/Downloads",
    );
    setDialog({ type: "download", files: downloadable });
  };

  const handleDeleteSelected = () => {
    if (selected.length === 0) return;
    setDialogValue("");
    setDialog({ type: "delete", files: selectedFiles });
  };

  const submitDialog = () => {
    if (!dialog) return;

    if (dialog.type === "mkdir") {
      const name = dialogValue.trim();
      if (!name) {
        setLoadError(t("filesInvalidPath"));
        return;
      }
      setDialog(null);
      void runOperation(async () => {
        const id = activeConnectionId();
        if (!id) return;
        await createSftpDirectory(id, joinRemotePath(currentPath, name));
        setOperationMessage(t("filesFolderCreated", { name }));
        refresh();
      });
      return;
    }

    if (dialog.type === "upload") {
      const localPath = dialogValue.trim();
      const name = basename(localPath);
      if (!name) {
        setLoadError(t("filesInvalidPath"));
        return;
      }
      setDialog(null);
      void runOperation(async () => {
        const id = activeConnectionId();
        if (!id) return;
        const transferId = addTransfer(name, "up");
        try {
          const result = await uploadSftpFile(id, localPath, joinRemotePath(currentPath, name));
          finishTransfer(transferId, result.bytes);
          setOperationMessage(t("filesUploaded", { name }));
          refresh();
        } catch (err) {
          removeTransfer(transferId);
          throw err;
        }
      });
      return;
    }

    if (dialog.type === "download") {
      const target = dialogValue.trim();
      if (!target) {
        setLoadError(t("filesInvalidPath"));
        return;
      }
      const downloadable = dialog.files;
      setDialog(null);
      void runOperation(async () => {
        const id = activeConnectionId();
        if (!id) return;
        for (const file of downloadable) {
          const transferId = addTransfer(file.name, "down");
          try {
            const localPath = downloadable.length === 1 ? target : joinLocalPath(target, file.name);
            const result = await downloadSftpFile(id, file.path, localPath);
            finishTransfer(transferId, result.bytes);
          } catch (err) {
            removeTransfer(transferId);
            throw err;
          }
        }
        setOperationMessage(t("filesDownloaded", { count: downloadable.length }));
      });
      return;
    }

    const paths = dialog.files.map(file => file.path);
    setDialog(null);
    void runOperation(async () => {
      const id = activeConnectionId();
      if (!id) return;
      await deleteSftpPaths(id, paths);
      setOperationMessage(t("filesDeleted", { count: paths.length }));
      setSelected([]);
      refresh();
    });
  };

  const addTransfer = (name: string, direction: "up" | "down") => {
    const id = `${direction}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setTransfers(previous => [
      { id, name, direction, progress: 35, size: "..." },
      ...previous,
    ]);
    return id;
  };

  const finishTransfer = (id: string, bytes: number) => {
    setTransfers(previous => previous.map(transfer =>
      transfer.id === id ? { ...transfer, progress: 100, size: formatSize(bytes) } : transfer
    ));
    window.setTimeout(() => removeTransfer(id), 1200);
  };

  const removeTransfer = (id: string) => {
    setTransfers(previous => previous.filter(transfer => transfer.id !== id));
  };

  return (
    <div
      className="relative h-full flex flex-col"
      style={{ backgroundColor: "var(--background)" }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
          style={{ backgroundColor: "rgba(37,99,235,0.12)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-xl"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--primary)", color: "var(--foreground)" }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: "var(--accent)", color: "var(--primary)" }}>
              <Upload size={18} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t("filesDropUploadTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                {t("filesDropUploadTarget", { path: currentPath })}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="px-5 lg:px-7 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--online)" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
              {t("filesCurrentConnection")}
            </span>
          </div>
          <span style={{ color: "var(--border)" }}>·</span>
          <div className="min-w-0">
            <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
              {connectionName}
            </div>
            <div className="truncate" style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
              {connectionAddress}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors"
            style={{ fontSize: 12, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)", opacity: busy ? 0.6 : 1 }}>
            <RefreshCw size={13} /> {t("commonRefresh")}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b flex items-center gap-2 flex-shrink-0"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
        <button onClick={() => setShowTree(t => !t)}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: showTree ? "var(--primary)" : "var(--muted-foreground)", backgroundColor: showTree ? "var(--accent)" : "transparent" }}>
          <HardDrive size={14} />
        </button>
        <div className="w-px h-5" style={{ backgroundColor: "var(--border)" }} />
        <button onClick={goUp}
          disabled={currentPath === "/"}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: currentPath === "/" ? "var(--muted-foreground)" : "var(--foreground)", opacity: currentPath === "/" ? 0.4 : 1 }}>
          <ArrowUp size={14} />
        </button>
        <button onClick={() => selectPath("/")}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--muted-foreground)" }}>
          <Home size={14} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => selectPath("/")} className="flex-shrink-0"
            style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            /
          </button>
          {pathParts.map((part, i) => {
            const p = "/" + pathParts.slice(0, i + 1).join("/");
            return (
              <div key={i} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight size={12} style={{ color: "var(--muted-foreground)" }} />
                <button onClick={() => selectPath(p)}
                  style={{ fontSize: 12, color: i === pathParts.length - 1 ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: i === pathParts.length - 1 ? 500 : 400 }}>
                  {part}
                </button>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border"
          style={{ backgroundColor: "var(--input-background)", borderColor: "var(--border)", minWidth: 140 }}>
          <Search size={12} style={{ color: "var(--muted-foreground)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("filesFilterPlaceholder")}
            className="bg-transparent outline-none w-full"
            style={{ fontSize: 12, color: "var(--foreground)" }} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button onClick={handleUpload} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors text-white"
            style={{ backgroundColor: "var(--primary)", fontSize: 12, opacity: busy ? 0.6 : 1 }}>
            <Upload size={12} /> {t("commonUpload")}
          </button>
          <button onClick={handleCreateDirectory} disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-colors"
            style={{ fontSize: 12, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)", opacity: busy ? 0.6 : 1 }}
            title={t("filesNewFolder")}>
            <Plus size={12} />
          </button>
          <button onClick={() => setViewMode(v => v === "list" ? "grid" : "list")}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors border"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}>
            {viewMode === "list" ? <Grid size={13} /> : <List size={13} />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Dir tree */}
        {showTree && (
          <div className="w-52 flex-shrink-0 border-r overflow-y-auto p-2"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)", scrollbarWidth: "none" }}>
            <DirectoryTree currentPath={currentPath} directories={currentDirectories} onSelect={selectPath} />
          </div>
        )}

        {/* File list */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {loadError && (
            <div className="px-4 py-2 border-b"
              style={{ fontSize: 12, color: "var(--destructive)", borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
              {loadError}
            </div>
          )}
          {operationMessage && !loadError && (
            <div className="px-4 py-2 border-b"
              style={{ fontSize: 12, color: "var(--online)", borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
              {operationMessage}
            </div>
          )}
          {viewMode === "list" ? (
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              {/* List header */}
              <div className="flex items-center px-4 py-2 border-b sticky top-0"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                <div style={{ width: 24 }} />
                <div className="flex-1 flex items-center gap-1.5 ml-2 cursor-pointer"
                  style={{ fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>
                  {t("filesName")} <SortAsc size={11} />
                </div>
                {!isMobile && <>
                  <div style={{ width: 100, fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>{t("filesPermissions")}</div>
                  <div style={{ width: 80, fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>{t("filesSize")}</div>
                  <div style={{ width: 130, fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>{t("filesModified")}</div>
                </>}
                <div style={{ width: 8 }} />
              </div>

              {files.map(file => (
                <div
                  key={file.path}
                  onClick={() => toggleSelect(file.path)}
                  onDoubleClick={() => { if (file.type === "dir") selectPath(file.path); }}
                  className="flex items-center px-4 py-2.5 border-b cursor-pointer transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: selected.includes(file.path) ? "var(--accent)" : "transparent",
                  }}
                  onMouseEnter={e => { if (!selected.includes(file.path)) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={e => { if (!selected.includes(file.path)) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    <FileIcon ext={file.ext} type={file.type} />
                  </div>
                  <div className="flex-1 ml-2.5 overflow-hidden">
                    <span style={{ fontSize: 13, color: "var(--foreground)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.name}
                    </span>
                  </div>
                  {!isMobile && <>
                    <div style={{ width: 100, fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                      {file.permissions}
                    </div>
                    <div style={{ width: 80, fontSize: 12, color: "var(--muted-foreground)" }}>
                      {formatSize(file.size)}
                    </div>
                    <div style={{ width: 130, fontSize: 12, color: "var(--muted-foreground)" }}>
                      {file.modified}
                    </div>
                  </>}
                  <div style={{ width: 8 }} />
                </div>
              ))}

              {files.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12"
                  style={{ color: "var(--muted-foreground)" }}>
                  <Folder size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <span style={{ fontSize: 13 }}>{t("filesEmptyDirectory")}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {files.map(file => (
                  <div key={file.path}
                    onClick={() => toggleSelect(file.path)}
                    onDoubleClick={() => { if (file.type === "dir") selectPath(file.path); }}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl border cursor-pointer transition-all"
                    style={{
                      backgroundColor: selected.includes(file.path) ? "var(--accent)" : "var(--card)",
                      borderColor: selected.includes(file.path) ? "var(--primary)" : "var(--border)",
                    }}>
                    <div className="w-10 h-10 flex items-center justify-center">
                      <FileIcon ext={file.ext} type={file.type} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--foreground)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                      {file.name}
                    </span>
                    {file.size !== undefined && (
                      <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{formatSize(file.size)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transfer progress bar */}
          {transfers.length > 0 && (
            <div className="border-t px-4 py-3 flex flex-col gap-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{t("filesTransfers")}</div>
              {transfers.map(transfer => (
                <div key={transfer.id} className="flex items-center gap-3">
                  {transfer.direction === "up" ? <Upload size={13} style={{ color: "var(--primary)" }} /> : <Download size={13} style={{ color: "#8b5cf6" }} />}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: 12, color: "var(--foreground)" }}>{transfer.name}</span>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{transfer.progress}% · {transfer.size}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--muted)" }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${transfer.progress}%`, backgroundColor: transfer.direction === "up" ? "var(--primary)" : "#8b5cf6" }} />
                    </div>
                  </div>
                  <button onClick={() => removeTransfer(transfer.id)} style={{ color: "var(--muted-foreground)" }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Status bar */}
          <div className="px-4 py-2 border-t flex items-center justify-between"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              {selected.length > 0 ? t("filesItemsSelected", { count: files.length, selected: selected.length }) : t("filesItems", { count: files.length })}
            </span>
            {selected.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={handleDownloadSelected} disabled={busy}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
                  style={{ fontSize: 11, backgroundColor: "var(--accent)", color: "var(--primary)", opacity: busy ? 0.6 : 1 }}>
                  <Download size={11} /> {t("commonDownload")}
                </button>
                <button onClick={handleDeleteSelected} disabled={busy}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
                  style={{ fontSize: 11, backgroundColor: "rgba(239,68,68,0.1)", color: "var(--destructive)", opacity: busy ? 0.6 : 1 }}>
                  <Trash2 size={11} /> {t("commonDelete")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {dialog && (
        <FileOperationDialog
          dialog={dialog}
          value={dialogValue}
          onValueChange={setDialogValue}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
          busy={busy}
          t={t}
        />
      )}
    </div>
  );
}

function toFileEntry(entry: RemoteFileEntry): FileEntry {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.entryType,
    size: entry.size || undefined,
    modified: entry.modified || "-",
    permissions: entry.permissions,
    ext: entry.extension || undefined,
  };
}

function joinRemotePath(base: string, name: string) {
  const cleanName = name.split("/").filter(Boolean).join("/");
  return base === "/" ? `/${cleanName}` : `${base.replace(/\/+$/, "")}/${cleanName}`;
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "";
}

function joinLocalPath(base: string, name: string) {
  return base.replace(/[\\/]+$/, "") + "/" + name;
}
