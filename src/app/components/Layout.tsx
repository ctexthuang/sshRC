import { useState } from "react";
import {
  LayoutDashboard, Server, Terminal, FolderOpen, Key, Settings,
  ChevronLeft, ChevronRight, Sun, Moon, Monitor
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import brandLogo from "../assets/sshcr-logo.png";

type Page = "dashboard" | "connections" | "terminal" | "files" | "keys" | "settings";
type ThemeMode = "light" | "dark" | "system";

const navItems = [
  { id: "dashboard" as Page, labelKey: "navDashboard", icon: LayoutDashboard },
  { id: "connections" as Page, labelKey: "navConnections", icon: Server },
  { id: "terminal" as Page, labelKey: "navTerminal", icon: Terminal },
  { id: "files" as Page, labelKey: "navFiles", icon: FolderOpen },
  { id: "keys" as Page, labelKey: "navKeys", icon: Key },
];

interface LayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenNewConnection: () => void;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  children: React.ReactNode;
  isMobile: boolean;
}

const themeIcons: Record<ThemeMode, React.ElementType> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function BrandLogo({ size }: { size: number }) {
  return (
    <img
      src={brandLogo}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="flex-shrink-0 select-none"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 32 ? 8 : 7,
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

export function Layout({ currentPage, onNavigate, onOpenNewConnection, themeMode, setThemeMode, children, isMobile }: LayoutProps) {
  const { t } = useI18n();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const ThemeIcon = themeIcons[themeMode];
  const cycleTheme = () => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(themeMode) + 1) % 3];
    setThemeMode(next);
  };

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {/* Mobile header */}
        <div className="relative flex items-center justify-center px-4 py-3 flex-shrink-0 border-b"
          style={{ backgroundColor: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}>
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandLogo size={28} />
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--sidebar-foreground)" }}>{t("appName")}</span>
          </div>
          <div
            className="absolute right-4 top-1/2 flex items-center gap-1"
            style={{ transform: "translateY(-50%)" }}
          >
            <button onClick={cycleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
              style={{ color: "var(--sidebar-foreground)" }}>
              <ThemeIcon size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">{children}</div>

        {/* Bottom nav */}
        <div className="flex-shrink-0 border-t pb-safe"
          style={{ backgroundColor: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}>
          <div className="flex">
            {navItems.map(item => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
                  style={{ color: isActive ? "var(--sidebar-primary)" : "var(--muted-foreground)" }}
                >
                  <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span style={{ fontSize: 9, fontWeight: isActive ? 500 : 400 }}>{t(item.labelKey)}</span>
                </button>
              );
            })}
            <button
              onClick={() => onNavigate("settings")}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
              style={{ color: currentPage === "settings" ? "var(--sidebar-primary)" : "var(--muted-foreground)" }}
            >
              <Settings size={20} strokeWidth={currentPage === "settings" ? 2.2 : 1.8} />
              <span style={{ fontSize: 9, fontWeight: currentPage === "settings" ? 500 : 400 }}>{t("navSettings")}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop/tablet layout
  const sidebarWidth = sidebarExpanded ? 220 : 64;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div
        className="flex flex-col flex-shrink-0 border-r transition-all duration-200"
        style={{
          width: sidebarWidth,
          backgroundColor: "var(--sidebar)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-[60px] border-b flex-shrink-0"
          style={{
            borderColor: "var(--sidebar-border)",
            justifyContent: sidebarExpanded ? "flex-start" : "center",
            padding: sidebarExpanded ? "0 12px 0 20px" : "0",
          }}
        >
          <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
            <BrandLogo size={32} />
            {sidebarExpanded && (
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--sidebar-foreground)", whiteSpace: "nowrap" }}>
                {t("appName")}
              </span>
            )}
          </div>
          {sidebarExpanded && (
            <button onClick={() => setSidebarExpanded(false)}
              className="ml-auto w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--muted-foreground)" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--sidebar-accent)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex flex-col gap-0.5">
            {navItems.map(item => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  title={!sidebarExpanded ? t(item.labelKey) : undefined}
                  className="flex items-center gap-2.5 rounded-xl transition-all"
                  style={{
                    height: 38,
                    padding: sidebarExpanded ? "0 12px" : "0",
                    justifyContent: sidebarExpanded ? "flex-start" : "center",
                    backgroundColor: isActive ? "var(--sidebar-accent)" : "transparent",
                    color: isActive ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
                    fontWeight: isActive ? 500 : 400,
                    fontSize: 13,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--sidebar-accent)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <item.icon size={16} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
                  {sidebarExpanded && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t(item.labelKey)}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-2 border-t flex flex-col gap-0.5" style={{ borderColor: "var(--sidebar-border)" }}>
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            title={!sidebarExpanded ? t("settingsTheme") : undefined}
            className="flex items-center gap-2.5 rounded-xl transition-colors"
            style={{
              height: 38,
              padding: sidebarExpanded ? "0 12px" : "0",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              color: "var(--muted-foreground)",
              fontSize: 13,
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--sidebar-accent)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <ThemeIcon size={16} style={{ flexShrink: 0 }} />
            {sidebarExpanded && (
              <span style={{ whiteSpace: "nowrap" }}>
                {themeMode === "light" ? t("themeLight") : themeMode === "dark" ? t("themeDark") : t("themeSystem")}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            onClick={() => onNavigate("settings")}
            title={!sidebarExpanded ? t("navSettings") : undefined}
            className="flex items-center gap-2.5 rounded-xl transition-all"
            style={{
              height: 38,
              padding: sidebarExpanded ? "0 12px" : "0",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              backgroundColor: currentPage === "settings" ? "var(--sidebar-accent)" : "transparent",
              color: currentPage === "settings" ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
              fontSize: 13,
              fontWeight: currentPage === "settings" ? 500 : 400,
            }}
            onMouseEnter={e => { if (currentPage !== "settings") e.currentTarget.style.backgroundColor = "var(--sidebar-accent)"; }}
            onMouseLeave={e => { if (currentPage !== "settings") e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <Settings size={16} style={{ flexShrink: 0 }} />
            {sidebarExpanded && t("navSettings")}
          </button>

          {!sidebarExpanded && (
            <button onClick={() => setSidebarExpanded(true)}
              className="flex items-center justify-center rounded-xl transition-colors"
              style={{ height: 38, color: "var(--muted-foreground)" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--sidebar-accent)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
