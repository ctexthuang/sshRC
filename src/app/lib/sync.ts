import { exportData, importData } from "./api";
import type { DataExportResult, DataImportResult } from "./types";
import type { SyncSettings } from "./settings";

const SYNC_STORAGE_PREFIX = "sshcr.sync.remote.";

interface StoredSyncPayload {
  format: "sshcr.sync.slot.v1";
  provider: SyncSettings["provider"];
  fragment: string;
  exportedAt: string;
  content: string;
}

export interface SyncOperationResult {
  syncedAt: string;
  exportResult?: DataExportResult;
  importResult?: DataImportResult;
}

export async function exportSyncData(settings: SyncSettings): Promise<SyncOperationResult> {
  const exportResult = await exportData({});
  const syncedAt = new Date().toISOString();
  writeSyncPayload(settings, {
    format: "sshcr.sync.slot.v1",
    provider: settings.provider,
    fragment: settings.fragment.trim(),
    exportedAt: syncedAt,
    content: applySyncScope(exportResult.content, settings),
  });
  return { syncedAt, exportResult };
}

export async function importSyncData(settings: SyncSettings): Promise<SyncOperationResult> {
  const payload = readSyncPayload(settings);
  if (!payload) {
    throw new Error("No sync payload found for this provider and fragment.");
  }
  const importResult = await importData({ content: payload.content });
  return { syncedAt: new Date().toISOString(), importResult };
}

export async function runSync(settings: SyncSettings): Promise<SyncOperationResult> {
  const payload = readSyncPayload(settings);
  const importResult = payload ? await importData({ content: payload.content }) : undefined;
  const exportResult = await exportData({});
  const syncedAt = new Date().toISOString();

  writeSyncPayload(settings, {
    format: "sshcr.sync.slot.v1",
    provider: settings.provider,
    fragment: settings.fragment.trim(),
    exportedAt: syncedAt,
    content: applySyncScope(exportResult.content, settings),
  });

  return { syncedAt, exportResult, importResult };
}

function readSyncPayload(settings: SyncSettings): StoredSyncPayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(syncStorageKey(settings));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredSyncPayload;
    return value?.format === "sshcr.sync.slot.v1" && typeof value.content === "string" ? value : null;
  } catch {
    return null;
  }
}

function writeSyncPayload(settings: SyncSettings, payload: StoredSyncPayload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(syncStorageKey(settings), JSON.stringify(payload));
}

function syncStorageKey(settings: SyncSettings) {
  return `${SYNC_STORAGE_PREFIX}${encodeURIComponent(`${settings.provider}:${settings.fragment.trim() || "sshRC-sync"}`)}`;
}

function applySyncScope(content: string, settings: SyncSettings) {
  try {
    const bundle = JSON.parse(content);
    if (!settings.scope.connections) bundle.connections = [];
    if (!settings.scope.keys) bundle.sshKeys = [];
    bundle.syncScope = settings.scope;
    return JSON.stringify(bundle, null, 2);
  } catch {
    return content;
  }
}
