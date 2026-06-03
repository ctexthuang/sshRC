# sshCR

中文 | [English](#english)

sshCR 是一个跨平台 SSH/SFTP 桌面客户端，基于 Tauri 2、React、Vite 和 Rust 构建。它以本地数据为主，适合管理常用主机、打开 SSH 终端、浏览远程文件、管理 SSH 密钥，并在多设备之间同步配置。

## 功能

- 连接管理：保存主机、端口、用户名、认证方式、标签、备注和收藏状态。
- SSH 终端：在桌面应用中打开真实 SSH 会话。
- SFTP 文件管理：浏览远程目录、上传、下载、新建文件夹和删除文件。
- SSH 密钥管理：保存密钥记录、公钥、指纹和使用关系。
- 数据导入导出：支持 sshCR JSON，也支持从 Termora JSON 导入主机和密钥。
- 配置同步：可配置 GitHub、GitLab、Gitee 或 WebDAV 同步槽。
- 发布下载：设置页内置 GitHub Release 入口，可下载当前平台安装包。

## 环境要求

- Node.js 20 或更新版本
- pnpm
- Rust stable
- macOS 或 Windows 桌面环境

## 本地运行

安装前端依赖：

```bash
pnpm install
```

启动浏览器预览：

```bash
pnpm dev
```

启动 Tauri 桌面应用：

```bash
pnpm tauri:dev
```

浏览器预览会使用 mock 数据；真实 SSH、SFTP、本地数据库和系统打开安装包等能力需要在 Tauri 桌面模式中使用。

## 使用方式

1. 打开“连接”，点击“添加主机”，填写主机、端口、用户名和认证方式。
2. 使用密码、SSH 密钥或 SSH agent 作为认证方式。
3. 在连接列表中点击“打开 SSH”进入终端，或点击“打开 SFTP”浏览远程文件。
4. 打开“SSH 密钥”维护密钥记录。
5. 打开“设置”调整主题、终端字体、Keep-Alive、数据导入导出和同步。
6. 在“设置 / 关于”中检查更新、下载对应平台安装包，或打开 GitHub Release 页面。

## 数据导入与同步

- “设置 / 数据管理”可以导入或导出 sshCR JSON。
- Termora 导入支持 `hosts` 与 `keyPairs`。Termora 密码不会保存；私钥会导入到本地应用数据目录。
- “设置 / 同步”可以配置同步服务、令牌、同步片段、同步策略和同步范围。

## 打包

本地打包当前平台：

```bash
pnpm tauri:build
```

发布打包由 GitHub Actions 处理。推送 `v*` tag 后会构建并上传：

- `sshCR-macos-arm64.dmg`
- `sshCR-macos-amd64.dmg`
- `sshCR-windows-amd64.exe`

应用内下载逻辑使用这些固定文件名。安装包下载时会先写入 `*.download` 临时文件，完成后再重命名并打开，避免打开未下载完成的缓存文件。

## 许可证

本项目使用 GPL-3.0-only 许可证。

---

## English

sshCR is a cross-platform SSH/SFTP desktop client built with Tauri 2, React, Vite, and Rust. It is local-first and helps you manage hosts, open SSH terminals, browse remote files, manage SSH keys, and sync configuration across devices.

## Features

- Connection management: save host, port, username, authentication type, tags, notes, and favorites.
- SSH terminal: open real SSH sessions in the desktop app.
- SFTP file manager: browse remote folders, upload, download, create folders, and delete files.
- SSH key management: keep key records, public keys, fingerprints, and usage relationships.
- Data import/export: supports sshCR JSON and Termora JSON imports.
- Settings sync: configure GitHub, GitLab, Gitee, or WebDAV sync slots.
- Release downloads: the Settings page includes GitHub Release links and platform-specific installer downloads.

## Requirements

- Node.js 20 or newer
- pnpm
- Rust stable
- macOS or Windows desktop environment

## Run Locally

Install frontend dependencies:

```bash
pnpm install
```

Start the browser preview:

```bash
pnpm dev
```

Start the Tauri desktop app:

```bash
pnpm tauri:dev
```

The browser preview uses mock data. Real SSH, SFTP, local database access, and system installer opening are available in Tauri desktop mode.

## How To Use

1. Open “Connections”, click “Add Host”, then enter host, port, username, and authentication details.
2. Choose password, SSH key, or SSH agent authentication.
3. From the connection list, click “Open SSH” for a terminal or “Open SFTP” for remote files.
4. Open “SSH Keys” to maintain key records.
5. Open “Settings” to configure theme, terminal font, Keep-Alive, import/export, and sync.
6. In “Settings / About”, check for updates, download the installer for your platform, or open the GitHub Release page.

## Import And Sync

- “Settings / Data Management” imports or exports sshCR JSON.
- Termora import supports `hosts` and `keyPairs`. Termora passwords are not saved; private keys are imported into the local app data directory.
- “Settings / Sync” configures sync provider, token, fragment, strategy, and scope.

## Packaging

Build the current platform locally:

```bash
pnpm tauri:build
```

Release packaging is handled by GitHub Actions. Push a `v*` tag to build and upload:

- `sshCR-macos-arm64.dmg`
- `sshCR-macos-amd64.dmg`
- `sshCR-windows-amd64.exe`

The app uses these fixed asset names for built-in downloads. Installers are first written as `*.download`, then renamed and opened after the download completes, so partial files are not opened.

## License

This project is licensed under GPL-3.0-only.
