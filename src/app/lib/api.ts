import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import { mockConnections, mockDashboard, mockFiles, mockSshKeys } from "./mock";
import type {
  Connection,
  ConnectionPayload,
  DataExportRequest,
  DataExportResult,
  DataImportRequest,
  DataImportResult,
  DashboardSummary,
  RemoteFileEntry,
  SftpTransferResult,
  SshKey,
  SshKeyPayload,
  TerminalConnectedEvent,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalSessionInfo,
} from "./types";

const DEFAULT_GITHUB_REPOSITORY = "ctexthuang/sshRC";

let browserSshKeys = [...mockSshKeys];
let browserConnections = [...mockConnections];
let browserFiles: Record<string, RemoteFileEntry[]> = cloneMockFiles();

export interface ReleaseInfo {
  currentVersion: string;
  target: string;
  supported: boolean;
  repository: string;
  releaseUrl: string;
  latestReleaseUrl: string;
  assetName?: string;
  downloadUrl?: string;
}

export interface LatestReleaseInfo {
  currentVersion: string;
  tagName: string;
  version: string;
  name?: string;
  publishedAt?: string;
  releaseUrl: string;
  assetName?: string;
  downloadUrl?: string;
  supported: boolean;
  updateAvailable: boolean;
}

export interface DownloadedInstaller {
  version: string;
  assetName: string;
  path: string;
  opened: boolean;
  releaseUrl: string;
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

async function command<T>(name: string, args: Record<string, unknown>, fallback: () => T | Promise<T>) {
  if (!isTauriRuntime()) {
    return fallback();
  }
  return invoke<T>(name, args);
}

export function listConnections() {
  return command<Connection[]>("list_connections", {}, () => browserConnections);
}

export function getConnection(id: string) {
  return command<Connection>("get_connection", { id }, async () => {
    const connection = browserConnections.find(item => item.id === id);
    if (!connection) throw new Error(`connection ${id} not found`);
    return connection;
  });
}

export function createConnection(payload: ConnectionPayload) {
  return command<Connection>("create_connection", { payload }, async () => {
    const now = new Date().toISOString();
    const connection = {
      id: `mock-${Date.now()}`,
      name: payload.name || payload.host,
      host: payload.host,
      port: payload.port || 22,
      username: payload.username,
      authType: payload.authType,
      keyPath: payload.keyPath,
      keyAlias: payload.keyAlias,
      favorite: Boolean(payload.favorite),
      tags: payload.tags || [],
      notes: payload.notes || "",
      os: null,
      lastConnectedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    browserConnections = [connection, ...browserConnections];
    return connection;
  });
}

export function updateConnection(id: string, payload: ConnectionPayload) {
  return command<Connection>("update_connection", { id, payload }, async () => {
    const existing = browserConnections.find(connection => connection.id === id);
    if (!existing) throw new Error(`connection ${id} not found`);
    const updated = {
      ...existing,
      name: payload.name || payload.host,
      host: payload.host,
      port: payload.port || 22,
      username: payload.username,
      authType: payload.authType,
      keyPath: payload.keyPath,
      keyAlias: payload.keyAlias,
      favorite: Boolean(payload.favorite),
      tags: payload.tags || [],
      notes: payload.notes || "",
      updatedAt: new Date().toISOString(),
    };
    browserConnections = browserConnections.map(connection => connection.id === id ? updated : connection);
    return updated;
  });
}

export function deleteConnection(id: string) {
  return command<void>("delete_connection", { id }, () => {
    browserConnections = browserConnections.filter(connection => connection.id !== id);
  });
}

export function saveConnectionPassword(connectionId: string, password: string) {
  return command<void>(
    "save_connection_password",
    { request: { connectionId, password } },
    () => undefined,
  );
}

export function exportData(request: DataExportRequest = {}) {
  return command<DataExportResult>("export_data", { request }, async () => {
    const content = JSON.stringify({
      format: "sshcr.portable.v1",
      app: "sshCR",
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      connections: browserConnections,
      sshKeys: browserSshKeys,
    }, null, 2);

    return {
      format: "sshcr.portable.v1",
      connectionsExported: browserConnections.length,
      sshKeysExported: browserSshKeys.length,
      content,
      path: request.path,
    };
  });
}

export function importData(request: DataImportRequest) {
  return command<DataImportResult>("import_data", { request }, async () => importBrowserData(request));
}

export function getReleaseInfo() {
  return command<ReleaseInfo>("release_info", {}, () => browserReleaseInfo());
}

export function checkLatestRelease() {
  return command<LatestReleaseInfo>("check_latest_release", {}, async () => {
    const info = browserReleaseInfo();
    return {
      currentVersion: info.currentVersion,
      tagName: `v${info.currentVersion}`,
      version: info.currentVersion,
      releaseUrl: info.latestReleaseUrl,
      assetName: info.assetName,
      downloadUrl: info.downloadUrl,
      supported: info.supported,
      updateAvailable: false,
    };
  });
}

export function downloadLatestInstaller(openAfterDownload = true) {
  return command<DownloadedInstaller>(
    "download_latest_installer",
    { openAfterDownload },
    async () => {
      const info = browserReleaseInfo();
      if (info.downloadUrl) {
        window.open(info.downloadUrl, "_blank", "noopener,noreferrer");
      }
      return {
        version: info.currentVersion,
        assetName: info.assetName || "",
        path: info.downloadUrl || "",
        opened: openAfterDownload,
        releaseUrl: info.latestReleaseUrl,
      };
    },
  );
}

export function openLatestReleasePage() {
  return command<void>("open_latest_release_page", {}, () => {
    window.open(browserReleaseInfo().latestReleaseUrl, "_blank", "noopener,noreferrer");
  });
}

export function dashboardSummary() {
  return command<DashboardSummary>("dashboard_summary", {}, () => mockDashboard);
}

export function listSshKeys() {
  return command<SshKey[]>("list_ssh_keys", {}, () => browserSshKeys);
}

export function createSshKey(payload: SshKeyPayload) {
  return command<SshKey>("create_ssh_key", { payload }, async () => {
    const key = {
      id: `mock-key-${Date.now()}`,
      name: payload.name,
      keyPath: payload.keyPath,
      publicKey: payload.publicKey,
      fingerprint: payload.fingerprint,
      encrypted: payload.encrypted ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    browserSshKeys = [key, ...browserSshKeys];
    return key;
  });
}

export function updateSshKey(id: string, payload: SshKeyPayload) {
  return command<SshKey>("update_ssh_key", { id, payload }, async () => {
    const existing = browserSshKeys.find(key => key.id === id);
    if (!existing) throw new Error(`ssh key ${id} not found`);
    const updated = {
      ...existing,
      name: payload.name,
      keyPath: payload.keyPath,
      publicKey: payload.publicKey,
      fingerprint: payload.fingerprint,
      encrypted: payload.encrypted ?? true,
      updatedAt: new Date().toISOString(),
    };
    browserSshKeys = browserSshKeys.map(key => key.id === id ? updated : key);
    return updated;
  });
}

export function deleteSshKey(id: string) {
  return command<void>("delete_ssh_key", { id }, () => {
    browserSshKeys = browserSshKeys.filter(key => key.id !== id);
  });
}

export function listSftpDirectory(connectionId: string | undefined, path: string) {
  return command<RemoteFileEntry[]>(
    "sftp_list_directory",
    { request: { connectionId, path } },
    () => browserFiles[path] || [],
  );
}

export function createSftpDirectory(connectionId: string | undefined, path: string) {
  return command<void>("sftp_create_directory", { request: { connectionId, path } }, () => {
    const parent = parentPath(path);
    const name = basename(path);
    if (!name) throw new Error("directory name is required");
    browserFiles[parent] = browserFiles[parent] || [];
    if (browserFiles[parent].some(entry => entry.name === name)) {
      throw new Error(`${path} already exists`);
    }
    browserFiles[parent] = [
      ...browserFiles[parent],
      mockEntry(name, parent, "dir"),
    ].sort(sortRemoteEntries);
    browserFiles[path] = browserFiles[path] || [];
  });
}

export function deleteSftpPaths(connectionId: string | undefined, paths: string[]) {
  return command<void>("sftp_delete_paths", { request: { connectionId, paths } }, () => {
    for (const path of paths) {
      const parent = parentPath(path);
      browserFiles[parent] = (browserFiles[parent] || []).filter(entry => entry.path !== path);
      for (const key of Object.keys(browserFiles)) {
        if (key === path || key.startsWith(`${path}/`)) {
          delete browserFiles[key];
        }
      }
    }
  });
}

export function uploadSftpFile(connectionId: string | undefined, localPath: string, remotePath: string) {
  return command<SftpTransferResult>(
    "sftp_upload_file",
    { request: { connectionId, localPath, remotePath } },
    () => {
      const parent = parentPath(remotePath);
      const name = basename(remotePath);
      if (!name) throw new Error("remote file name is required");
      const size = 4096 + name.length * 37;
      browserFiles[parent] = [
        ...(browserFiles[parent] || []).filter(entry => entry.path !== remotePath),
        mockEntry(name, parent, "file", size, extensionFromName(name)),
      ].sort(sortRemoteEntries);
      return { path: remotePath, bytes: size };
    },
  );
}

export function downloadSftpFile(connectionId: string | undefined, remotePath: string, localPath: string) {
  return command<SftpTransferResult>(
    "sftp_download_file",
    { request: { connectionId, remotePath, localPath } },
    () => {
      const parent = parentPath(remotePath);
      const file = (browserFiles[parent] || []).find(entry => entry.path === remotePath);
      return { path: remotePath, bytes: file?.size || 0 };
    },
  );
}

export function startTerminalSession(
  connectionId: string,
  cols: number,
  rows: number,
  options: { password?: string; passphrase?: string; keepAlive?: boolean; keepAliveInterval?: number } = {},
) {
  return command<TerminalSessionInfo>(
    "start_terminal_session",
    {
      request: {
        connectionId,
        cols,
        rows,
        password: options.password,
        passphrase: options.passphrase,
        keepAlive: options.keepAlive,
        keepAliveInterval: options.keepAliveInterval,
      },
    },
    () => ({ id: `mock-terminal-${Date.now()}`, connectionId }),
  );
}

export function writeTerminalSession(sessionId: string, data: string) {
  return command<void>("write_terminal_session", { sessionId, data }, () => undefined);
}

export function stopTerminalSession(sessionId: string) {
  return command<void>("stop_terminal_session", { sessionId }, () => undefined);
}

export function onTerminalOutput(callback: EventCallback<TerminalOutputEvent>): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return Promise.resolve(() => undefined);
  }
  return listen<TerminalOutputEvent>("terminal-output", callback);
}

export function onTerminalConnected(callback: EventCallback<TerminalConnectedEvent>): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return Promise.resolve(() => undefined);
  }
  return listen<TerminalConnectedEvent>("terminal-connected", callback);
}

export function onTerminalExit(callback: EventCallback<TerminalExitEvent>): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return Promise.resolve(() => undefined);
  }
  return listen<TerminalExitEvent>("terminal-exit", callback);
}

function cloneMockFiles() {
  return Object.fromEntries(
    Object.entries(mockFiles).map(([path, entries]) => [path, entries.map(entry => ({ ...entry }))]),
  );
}

async function importBrowserData(request: DataImportRequest): Promise<DataImportResult> {
  const content = request.content?.trim();
  if (!content) {
    throw new Error("Browser preview import requires pasted JSON content.");
  }

  const value = JSON.parse(content);
  if (value?.format === "sshcr.portable.v1") {
    const connections = Array.isArray(value.connections) ? value.connections : [];
    const sshKeys = Array.isArray(value.sshKeys) ? value.sshKeys : [];
    let connectionsImported = 0;
    let sshKeysImported = 0;
    let skipped = 0;

    for (const key of sshKeys) {
      if (!key?.name || !key?.keyPath) {
        skipped += 1;
        continue;
      }
      if (browserSshKeys.some(item => item.name === key.name || item.keyPath === key.keyPath)) {
        skipped += 1;
        continue;
      }
      browserSshKeys = [{ ...key, id: `browser-key-${Date.now()}-${sshKeysImported}` }, ...browserSshKeys];
      sshKeysImported += 1;
    }

    for (const connection of connections) {
      if (!connection?.host || !connection?.username) {
        skipped += 1;
        continue;
      }
      if (browserConnections.some(item => item.host === connection.host && item.port === connection.port && item.username === connection.username)) {
        skipped += 1;
        continue;
      }
      browserConnections = [{ ...connection, id: `browser-connection-${Date.now()}-${connectionsImported}` }, ...browserConnections];
      connectionsImported += 1;
    }

    return {
      format: "sshcr.portable.v1",
      connectionsImported,
      sshKeysImported,
      skipped,
      warnings: [],
    };
  }

  if (value?.keyPairs && Array.isArray(value?.hosts)) {
    return importBrowserTermoraData(value);
  }

  throw new Error("Unsupported import format.");
}

function importBrowserTermoraData(value: any): DataImportResult {
  const keyPairs = Array.isArray(value.keyPairs) ? value.keyPairs : [];
  const hosts = Array.isArray(value.hosts) ? value.hosts : [];
  const folderNames = new Map<string, string>();
  const keyAliases = new Map<string, string>();
  let connectionsImported = 0;
  let sshKeysImported = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const host of hosts) {
    if (host?.protocol === "Folder" && typeof host.id === "string" && typeof host.name === "string" && host.name.trim()) {
      folderNames.set(host.id, host.name.trim());
    }
  }

  for (const pair of keyPairs) {
    const name = String(pair?.name || pair?.remark || "").trim();
    const id = String(pair?.id || "").trim();
    if (!name || !id) {
      skipped += 1;
      continue;
    }
    keyAliases.set(id, name);
    const keyPath = `termora://key-pairs/${id}`;
    if (browserSshKeys.some(key => key.name === name || key.keyPath === keyPath)) {
      skipped += 1;
      continue;
    }
    const now = new Date().toISOString();
    browserSshKeys = [{
      id: `browser-termora-key-${Date.now()}-${sshKeysImported}`,
      name,
      keyPath,
      publicKey: typeof pair.publicKey === "string" ? pair.publicKey : undefined,
      fingerprint: undefined,
      encrypted: false,
      createdAt: now,
      updatedAt: now,
    }, ...browserSshKeys];
    sshKeysImported += 1;
  }

  for (const host of hosts) {
    if (host?.protocol !== "SSH") continue;
    const hostname = String(host.host || "").trim();
    const username = String(host.username || "").trim();
    const port = Number(host.port || 22);
    if (!hostname || !username || !Number.isFinite(port) || port <= 0) {
      skipped += 1;
      continue;
    }
    if (browserConnections.some(connection => connection.host === hostname && connection.port === port && connection.username === username)) {
      skipped += 1;
      continue;
    }

    const authKind = String(host.authentication?.type || "").toLowerCase();
    const authType = authKind === "password" ? "password" : authKind === "publickey" ? "key" : "agent";
    const keyAlias = authType === "key" ? keyAliases.get(String(host.authentication?.password || "")) : undefined;
    if (authType === "password") {
      warnings.push(`Imported ${host.name || hostname} without saving Termora password`);
    }
    const tags = ["Termora"];
    const folderName = folderNames.get(String(host.parentId || ""));
    if (folderName) tags.unshift(folderName);
    const now = new Date().toISOString();
    browserConnections = [{
      id: `browser-termora-connection-${Date.now()}-${connectionsImported}`,
      name: String(host.name || hostname).trim(),
      host: hostname,
      port,
      username,
      authType,
      keyPath: undefined,
      keyAlias,
      favorite: false,
      tags,
      notes: "Imported from Termora",
      os: null,
      lastConnectedAt: null,
      createdAt: now,
      updatedAt: now,
    }, ...browserConnections];
    connectionsImported += 1;
  }

  return {
    format: "termora",
    connectionsImported,
    sshKeysImported,
    skipped,
    warnings,
  };
}

function browserReleaseInfo(): ReleaseInfo {
  const repository = String(import.meta.env.VITE_SSHCR_GITHUB_REPO || DEFAULT_GITHUB_REPOSITORY);
  const target = browserReleaseTarget();
  const assetName = releaseAssetName(target);
  const latestReleaseUrl = `https://github.com/${repository}/releases/latest`;

  return {
    currentVersion: "0.1.0",
    target,
    supported: Boolean(assetName),
    repository,
    releaseUrl: `https://github.com/${repository}`,
    latestReleaseUrl,
    assetName,
    downloadUrl: assetName ? `${latestReleaseUrl}/download/${assetName}` : undefined,
  };
}

function browserReleaseTarget() {
  if (typeof navigator === "undefined") return "unsupported";
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes("mac")) {
    return userAgent.includes("arm") || userAgent.includes("aarch64") ? "macos-arm64" : "macos-amd64";
  }
  if (platform.includes("win")) return "windows-amd64";
  return "unsupported";
}

function releaseAssetName(target: string) {
  if (target === "macos-arm64") return "sshCR-macos-arm64.dmg";
  if (target === "macos-amd64") return "sshCR-macos-amd64.dmg";
  if (target === "windows-amd64") return "sshCR-windows-amd64.exe";
  return undefined;
}

function parentPath(path: string) {
  const normalized = normalizeRemotePath(path);
  if (normalized === "/") return "/";
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

function basename(path: string) {
  return normalizeRemotePath(path).split("/").filter(Boolean).pop() || "";
}

function normalizeRemotePath(path: string) {
  const normalized = `/${path.split("/").filter(Boolean).join("/")}`;
  return normalized === "" ? "/" : normalized;
}

function extensionFromName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : undefined;
}

function mockEntry(
  name: string,
  base: string,
  entryType: "dir" | "file",
  size?: number,
  extension?: string,
): RemoteFileEntry {
  const path = base === "/" ? `/${name}` : `${base}/${name}`;
  return {
    name,
    path,
    entryType,
    size,
    modified: "Jun 2 09:20",
    permissions: entryType === "dir" ? "drwxr-xr-x" : "-rw-r--r--",
    extension,
  };
}

function sortRemoteEntries(a: RemoteFileEntry, b: RemoteFileEntry) {
  if (a.entryType !== b.entryType) return a.entryType === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}
