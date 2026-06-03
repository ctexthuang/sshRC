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
    extension: &'static str,
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
    let latest_tag = normalize_release_tag(&latest.tag_name);
    let current_tag = current_release_tag();
    let asset = target.and_then(|target| find_asset_for_target(&latest, target));
    let asset_name = asset.as_ref().map(|(_, asset_name)| asset_name.clone());
    let download_url = asset
        .as_ref()
        .map(|(asset, _)| asset.browser_download_url.clone());

    Ok(LatestReleaseInfo {
        current_version: current_tag.clone(),
        tag_name: latest_tag.clone(),
        version: latest_tag.clone(),
        name: latest.name,
        published_at: latest.published_at,
        release_url: latest.html_url,
        asset_name,
        download_url,
        supported: target.is_some(),
        update_available: is_newer_release(&latest_tag, &current_tag),
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
    let latest_tag = normalize_release_tag(&latest.tag_name);
    let installer_name = release_asset_name(&latest.tag_name, target);
    let asset = find_asset_for_target(&latest, target).ok_or_else(|| {
        AppError::NotFound(format!(
            "release asset {} was not found in {}",
            installer_name, latest.html_url
        ))
    })?;
    let download_url = asset.0.browser_download_url.clone();
    let release_url = latest.html_url;

    let downloads_dir = app.path().download_dir()?;
    fs::create_dir_all(&downloads_dir)?;
    let final_path = unique_download_path(&downloads_dir, &installer_name);
    let temp_path = temporary_download_path(&final_path)?;

    if temp_path.exists() {
        fs::remove_file(&temp_path)?;
    }

    if let Err(err) = download_to_path(&download_url, &temp_path).await {
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
        version: latest_tag,
        asset_name: installer_name,
        path: final_path.to_string_lossy().to_string(),
        opened: should_open,
        release_url,
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
    let current_tag = current_release_tag();
    let asset_name = target.map(|target| release_asset_name(&current_tag, target));
    let download_url = asset_name.as_deref().map(latest_download_url);

    ReleaseInfo {
        current_version: current_tag,
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
    let response = http_client()?.get(&url).send().await?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::NotFound(format!(
            "GitHub latest release was not found for {}",
            github_repository()
        )));
    }
    let release = response.error_for_status()?.json::<GithubRelease>().await?;

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
        .user_agent(format!("sshRC/{}", current_release_tag()))
        .build()?)
}

fn find_asset<'a>(release: &'a GithubRelease, asset_name: &str) -> Option<&'a GithubAsset> {
    release.assets.iter().find(|asset| asset.name == asset_name)
}

fn find_asset_for_target<'a>(
    release: &'a GithubRelease,
    target: TargetAsset,
) -> Option<(&'a GithubAsset, String)> {
    let versioned_name = release_asset_name(&release.tag_name, target);
    if let Some(asset) = find_asset(release, &versioned_name) {
        return Some((asset, versioned_name));
    }

    find_asset(release, &legacy_asset_name(target)).map(|asset| (asset, versioned_name))
}

fn current_target_asset() -> Option<TargetAsset> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some(TargetAsset {
            target: "macos-arm64",
            extension: "dmg",
        })
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some(TargetAsset {
            target: "macos-amd64",
            extension: "dmg",
        })
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some(TargetAsset {
            target: "windows-amd64",
            extension: "exe",
        })
    } else {
        None
    }
}

fn release_asset_name(tag_name: &str, target: TargetAsset) -> String {
    format!(
        "sshRC-{}-{}.{}",
        normalize_release_tag(tag_name),
        target.target,
        target.extension
    )
}

fn legacy_asset_name(target: TargetAsset) -> String {
    format!("sshRC-{}.{}", target.target, target.extension)
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

fn current_release_tag() -> String {
    normalize_release_tag(current_version())
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

fn normalize_release_tag(tag_name: &str) -> String {
    let trimmed = tag_name.trim();
    let version = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    format!("v{version}")
}

#[derive(Debug, Eq, PartialEq)]
struct ReleaseVersion {
    major: u64,
    minor: u64,
    patch: u64,
    prerelease: Option<String>,
}

fn is_newer_release(latest_tag: &str, current_tag: &str) -> bool {
    match (
        parse_release_version(latest_tag),
        parse_release_version(current_tag),
    ) {
        (Some(latest), Some(current)) => latest > current,
        _ => latest_tag != current_tag,
    }
}

fn parse_release_version(tag_name: &str) -> Option<ReleaseVersion> {
    let normalized = normalize_release_tag(tag_name);
    let version = normalized.strip_prefix('v')?;
    let without_build = version.split_once('+').map_or(version, |(value, _)| value);
    let (core, prerelease) = without_build
        .split_once('-')
        .map_or((without_build, None), |(core, prerelease)| (core, Some(prerelease)));
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }

    Some(ReleaseVersion {
        major,
        minor,
        patch,
        prerelease: prerelease.map(str::to_string),
    })
}

impl Ord for ReleaseVersion {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (self.major, self.minor, self.patch)
            .cmp(&(other.major, other.minor, other.patch))
            .then_with(|| match (self.prerelease.as_deref(), other.prerelease.as_deref()) {
                (None, None) => std::cmp::Ordering::Equal,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (Some(_), None) => std::cmp::Ordering::Less,
                (Some(left), Some(right)) => compare_prerelease(left, right),
            })
    }
}

impl PartialOrd for ReleaseVersion {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

fn compare_prerelease(left: &str, right: &str) -> std::cmp::Ordering {
    let mut left_parts = left.split('.');
    let mut right_parts = right.split('.');

    loop {
        match (left_parts.next(), right_parts.next()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (Some(left), Some(right)) => {
                let ordering = compare_prerelease_identifier(left, right);
                if ordering != std::cmp::Ordering::Equal {
                    return ordering;
                }
            }
        }
    }
}

fn compare_prerelease_identifier(left: &str, right: &str) -> std::cmp::Ordering {
    match (left.parse::<u64>(), right.parse::<u64>()) {
        (Ok(left), Ok(right)) => left.cmp(&right),
        (Ok(_), Err(_)) => std::cmp::Ordering::Less,
        (Err(_), Ok(_)) => std::cmp::Ordering::Greater,
        (Err(_), Err(_)) => left.cmp(right),
    }
}

#[cfg(test)]
mod tests {
    use super::is_newer_release;

    #[test]
    fn compares_release_tags_semantically() {
        assert!(is_newer_release("v0.2.0", "v0.1.9"));
        assert!(is_newer_release("v1.0.0", "v1.0.0-beta.1"));
        assert!(is_newer_release("v1.0.0-beta.10", "v1.0.0-beta.2"));
        assert!(is_newer_release("v1.0.0-alpha.1", "v1.0.0-alpha"));
        assert!(!is_newer_release("v0.1.0", "v0.2.0"));
        assert!(!is_newer_release("v0.1.0", "0.1.0"));
    }
}
