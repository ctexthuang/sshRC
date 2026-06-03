export type AuthType = "password" | "key" | "agent";

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  keyPath?: string | null;
  keyAlias?: string | null;
  favorite: boolean;
  tags: string[];
  notes: string;
  os?: string | null;
  lastConnectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionPayload {
  name?: string;
  host: string;
  port?: number;
  username: string;
  authType: AuthType;
  keyPath?: string;
  keyAlias?: string;
  favorite?: boolean;
  tags?: string[];
  notes?: string;
}

export interface Activity {
  id: string;
  kind: "connect" | "disconnect" | "upload" | "download" | string;
  connectionId?: string | null;
  connectionName?: string | null;
  detail?: string | null;
  bytes?: number | null;
  createdAt: string;
}

export interface DashboardSummary {
  totalHosts: number;
  activeSessions: number;
  transfersToday: number;
  transferBytesToday: number;
  recentConnections: Connection[];
  recentActivity: Activity[];
}

export interface SshKey {
  id: string;
  name: string;
  keyPath: string;
  publicKey?: string | null;
  fingerprint?: string | null;
  encrypted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SshKeyPayload {
  name: string;
  keyPath: string;
  publicKey?: string;
  fingerprint?: string;
  encrypted?: boolean;
}

export interface RemoteFileEntry {
  name: string;
  path: string;
  entryType: "dir" | "file";
  size?: number | null;
  modified?: string | null;
  permissions: string;
  extension?: string | null;
}

export interface SftpTransferResult {
  path: string;
  bytes: number;
}

export interface TerminalSessionInfo {
  id: string;
  connectionId: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalConnectedEvent {
  sessionId: string;
  connectionId: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  message: string;
}

export interface DataImportRequest {
  path?: string;
  content?: string;
}

export interface DataExportRequest {
  path?: string;
}

export interface DataImportResult {
  format: string;
  connectionsImported: number;
  sshKeysImported: number;
  skipped: number;
  warnings: string[];
}

export interface DataExportResult {
  format: string;
  connectionsExported: number;
  sshKeysExported: number;
  content: string;
  path?: string | null;
}
