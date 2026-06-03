use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DEFAULT_GITHUB_REPOSITORY: &str = "ctexthuang/sshRC";

#[derive(Clone, Copy)]
struct TargetAsset {
    target: &'static str,
    asset_name: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    current_version: String,
    target: String,
    supported: bool,
    repository: String,
    release_url: String,
    latest_release_url: String,
    asset_name: Option<String>,
    download_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestReleaseInfo {
    current_version: String,
    tag_name: String,
    version: String,
    name: Option<String>,
    published_at: Option<String>,
    release_url: String,
    asset_name: Option<String>,
    download_url: Option<String>,
    supported: bool,
    update_available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedInstaller {
    version: String,
    asset_name: String,
    path: String,
    opened: bool,
    release_url: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub fn release_info() -> ReleaseInfo {
    build_release_info()
}

#[tauri::command]
pub async fn check_latest_release() -> Result<LatestReleaseInfo> {
    let latest = fetch_latest_release().await?;
    let target = current_target_asset();
    let asset = target.and_then(|target| find_asset(&latest, target.asset_name));
    let version = version_from_tag(&latest.tag_name);
    let asset_name = asset.map(|asset| asset.name.clone());
    let download_url = asset.map(|asset| asset.browser_download_url.clone());

    Ok(LatestReleaseInfo {
        current_version: current_version().into(),
        tag_name: latest.tag_name,
        version: version.clone(),
        name: latest.name,
        published_at: latest.published_at,
        release_url: latest.html_url,
        asset_name,
        download_url,
        supported: target.is_some(),
        update_available: version != current_version(),
    })
}

#[tauri::command]
pub async fn download_latest_installer(
    app: AppHandle,
    open_after_download: Option<bool>,
) -> Result<DownloadedInstaller> {
    let target = current_target_asset().ok_or_else(|| {
        AppError::InvalidInput("no GitHub installer is configured for this platform".into())
    })?;
    let latest = fetch_latest_release().await?;
    let asset = find_asset(&latest, target.asset_name).ok_or_else(|| {
        AppError::NotFound(format!(
            "release asset {} was not found in {}",
            target.asset_name, latest.html_url
        ))
    })?;

    let downloads_dir = app.path().download_dir()?;
    fs::create_dir_all(&downloads_dir)?;
    let final_path = unique_download_path(&downloads_dir, target.asset_name);
    let temp_path = temporary_download_path(&final_path)?;

    if temp_path.exists() {
        fs::remove_file(&temp_path)?;
    }

    if let Err(err) = download_to_path(&asset.browser_download_url, &temp_path).await {
        let _ = fs::remove_file(&temp_path);
        return Err(err);
    }

    fs::rename(&temp_path, &final_path)?;

    let should_open = open_after_download.unwrap_or(true);
    if should_open {
        tauri_plugin_opener::open_path(&final_path, None::<&str>)
            .map_err(|err| AppError::Task(format!("failed to open installer: {err}")))?;
    }

    Ok(DownloadedInstaller {
        version: version_from_tag(&latest.tag_name),
        asset_name: target.asset_name.into(),
        path: final_path.to_string_lossy().to_string(),
        opened: should_open,
        release_url: latest.html_url,
    })
}

#[tauri::command]
pub fn open_latest_release_page() -> Result<()> {
    tauri_plugin_opener::open_url(latest_release_url(), None::<&str>)
        .map_err(|err| AppError::Task(format!("failed to open release page: {err}")))?;
    Ok(())
}

fn build_release_info() -> ReleaseInfo {
    let target = current_target_asset();
    let asset_name = target.map(|target| target.asset_name.to_string());
    let download_url = asset_name.as_deref().map(latest_download_url);

    ReleaseInfo {
        current_version: current_version().into(),
        target: target
            .map(|target| target.target.to_string())
            .unwrap_or_else(|| "unsupported".into()),
        supported: target.is_some(),
        repository: github_repository().into(),
        release_url: repository_url(),
        latest_release_url: latest_release_url(),
        asset_name,
        download_url,
    }
}

async fn fetch_latest_release() -> Result<GithubRelease> {
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        github_repository()
    );
    let release = http_client()?
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json::<GithubRelease>()
        .await?;

    Ok(release)
}

async fn download_to_path(url: &str, path: &Path) -> Result<()> {
    let mut response = http_client()?.get(url).send().await?.error_for_status()?;
    let mut file = fs::File::create(path)?;

    while let Some(chunk) = response.chunk().await? {
        file.write_all(&chunk)?;
    }

    file.sync_all()?;
    Ok(())
}

fn http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(format!("sshCR/{}", current_version()))
        .build()?)
}

fn find_asset<'a>(release: &'a GithubRelease, asset_name: &str) -> Option<&'a GithubAsset> {
    release.assets.iter().find(|asset| asset.name == asset_name)
}

fn current_target_asset() -> Option<TargetAsset> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some(TargetAsset {
            target: "macos-arm64",
            asset_name: "sshCR-macos-arm64.dmg",
        })
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some(TargetAsset {
            target: "macos-amd64",
            asset_name: "sshCR-macos-amd64.dmg",
        })
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some(TargetAsset {
            target: "windows-amd64",
            asset_name: "sshCR-windows-amd64.exe",
        })
    } else {
        None
    }
}

fn unique_download_path(downloads_dir: &Path, file_name: &str) -> PathBuf {
    let candidate = downloads_dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let file_path = Path::new(file_name);
    let stem = file_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name);
    let extension = file_path.extension().and_then(|value| value.to_str());

    for index in 1..100 {
        let next_name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        let next_path = downloads_dir.join(next_name);
        if !next_path.exists() {
            return next_path;
        }
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let fallback_name = match extension {
        Some(extension) => format!("{stem}-{timestamp}.{extension}"),
        None => format!("{stem}-{timestamp}"),
    };
    downloads_dir.join(fallback_name)
}

fn temporary_download_path(final_path: &Path) -> Result<PathBuf> {
    let file_name = final_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidInput("installer path has no file name".into()))?;
    Ok(final_path.with_file_name(format!("{file_name}.download")))
}

fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn github_repository() -> &'static str {
    option_env!("SSHCR_GITHUB_REPO").unwrap_or(DEFAULT_GITHUB_REPOSITORY)
}

fn repository_url() -> String {
    format!("https://github.com/{}", github_repository())
}

fn latest_release_url() -> String {
    format!("{}/releases/latest", repository_url())
}

fn latest_download_url(asset_name: &str) -> String {
    format!("{}/download/{asset_name}", latest_release_url())
}

fn version_from_tag(tag_name: &str) -> String {
    tag_name
        .strip_prefix('v')
        .or_else(|| tag_name.strip_prefix('V'))
        .unwrap_or(tag_name)
        .to_string()
}
