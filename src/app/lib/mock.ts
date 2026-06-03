import type { Activity, Connection, DashboardSummary, RemoteFileEntry, SshKey } from "./types";

export const mockConnections: Connection[] = [];

export const mockActivity: Activity[] = [];

export const mockDashboard: DashboardSummary = {
  totalHosts: 0,
  activeSessions: 0,
  transfersToday: 0,
  transferBytesToday: 0,
  recentConnections: [],
  recentActivity: mockActivity,
};

export const mockSshKeys: SshKey[] = [];

export const mockFiles: Record<string, RemoteFileEntry[]> = {
  "/": [
    entry("home", "/", "dir"),
    entry("var", "/", "dir"),
    entry("etc", "/", "dir"),
    entry("tmp", "/", "dir"),
  ],
  "/home/ubuntu": [
    entry("projects", "/home/ubuntu", "dir"),
    entry("scripts", "/home/ubuntu", "dir"),
    entry(".ssh", "/home/ubuntu", "dir", undefined, "drwx------"),
    entry(".bashrc", "/home/ubuntu", "file", 3771, "-rw-r--r--", "sh"),
    entry("deploy.sh", "/home/ubuntu", "file", 4238, "-rwxr-xr-x", "sh"),
  ],
  "/home/ubuntu/projects": [
    entry("webapp", "/home/ubuntu/projects", "dir"),
    entry("api-server", "/home/ubuntu/projects", "dir"),
  ],
  "/var/www/html": [
    entry("index.html", "/var/www/html", "file", 2341, "-rw-r--r--", "html"),
    entry("bundle.js", "/var/www/html", "file", 248192, "-rw-r--r--", "js"),
    entry("styles.css", "/var/www/html", "file", 18430, "-rw-r--r--", "css"),
    entry("assets", "/var/www/html", "dir"),
  ],
};

function entry(
  name: string,
  base: string,
  entryType: "dir" | "file",
  size?: number,
  permissions = entryType === "dir" ? "drwxr-xr-x" : "-rw-r--r--",
  extension?: string,
): RemoteFileEntry {
  const path = base === "/" ? `/${name}` : `${base}/${name}`;
  return {
    name,
    path,
    entryType,
    size,
    modified: "Jun 2 09:20",
    permissions,
    extension,
  };
}
