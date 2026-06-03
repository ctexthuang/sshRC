use std::{
    fs,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ring::signature::{Ed25519KeyPair, KeyPair};

use crate::error::{AppError, Result};

const OID_ED25519: &[u8] = &[0x2b, 0x65, 0x70];
const OID_RSA_ENCRYPTION: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];

pub struct PreparedPrivateKey {
    path: PathBuf,
    temporary_path: Option<PathBuf>,
}

impl PreparedPrivateKey {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for PreparedPrivateKey {
    fn drop(&mut self) {
        if let Some(path) = self.temporary_path.as_ref() {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn normalize_private_key_content(content: &str) -> Option<String> {
    let mut normalized = content
        .trim()
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace("\\n", "\n");

    if normalized.trim_start().starts_with("-----BEGIN ") {
        if !normalized.ends_with('\n') {
            normalized.push('\n');
        }
        return Some(normalized);
    }

    let compact = normalized
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>();

    if is_likely_base64_der_private_key(&compact) {
        return normalize_base64_der_private_key(&compact);
    }

    None
}

pub fn private_key_is_encrypted(content: &str) -> bool {
    let lower = content.to_ascii_lowercase();
    lower.contains("encrypted") || lower.contains("proc-type: 4,encrypted")
}

pub fn prepare_private_key_for_auth(key_path: &str) -> Result<PreparedPrivateKey> {
    if key_path.starts_with("termora://") {
        return Err(AppError::CredentialsRequired(
            "this Termora key does not contain a usable private-key file; re-import Termora data or edit the SSH key and choose a local private key file".into(),
        ));
    }

    let path = expand_home(key_path);
    let content = fs::read_to_string(&path)?;
    let Some(normalized) = normalize_private_key_content(&content) else {
        return Ok(PreparedPrivateKey {
            path,
            temporary_path: None,
        });
    };

    if normalized == content {
        return Ok(PreparedPrivateKey {
            path,
            temporary_path: None,
        });
    }

    let temporary_path = std::env::temp_dir().join(format!("sshcr-key-{}", uuid::Uuid::new_v4()));
    fs::write(&temporary_path, normalized)?;
    set_private_key_permissions(&temporary_path)?;

    Ok(PreparedPrivateKey {
        path: temporary_path.clone(),
        temporary_path: Some(temporary_path),
    })
}

fn is_likely_base64_der_private_key(value: &str) -> bool {
    value.len() >= 48
        && value.len() % 4 == 0
        && value.starts_with('M')
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '/' || ch == '=')
}

fn normalize_base64_der_private_key(value: &str) -> Option<String> {
    let der = BASE64.decode(value).ok()?;
    if der.first().copied() != Some(0x30) {
        return None;
    }

    if let Some(seed) = extract_ed25519_seed(&der) {
        return format_ed25519_openssh_key(&seed);
    }

    if let Some(pkcs1) = extract_rsa_pkcs1_private_key(&der) {
        let body = BASE64.encode(pkcs1);
        return Some(format_pem("RSA PRIVATE KEY", &body));
    }

    Some(format_pem("PRIVATE KEY", value))
}

fn extract_ed25519_seed(der: &[u8]) -> Option<[u8; 32]> {
    let (algorithm_oid, private_key) = parse_pkcs8_private_key_info(der)?;
    if algorithm_oid != OID_ED25519 {
        return None;
    }

    let seed = if private_key.len() == 32 {
        private_key
    } else {
        let mut offset = 0;
        let inner = read_der_element(private_key, &mut offset)?;
        if inner.tag != 0x04 || inner.value.len() != 32 {
            return None;
        }
        inner.value
    };

    let mut output = [0_u8; 32];
    output.copy_from_slice(seed);
    Some(output)
}

fn extract_rsa_pkcs1_private_key(der: &[u8]) -> Option<&[u8]> {
    let (algorithm_oid, private_key) = parse_pkcs8_private_key_info(der)?;
    if algorithm_oid == OID_RSA_ENCRYPTION && private_key.first().copied() == Some(0x30) {
        Some(private_key)
    } else {
        None
    }
}

fn parse_pkcs8_private_key_info(der: &[u8]) -> Option<(&[u8], &[u8])> {
    let mut offset = 0;
    let outer = read_der_element(der, &mut offset)?;
    if outer.tag != 0x30 {
        return None;
    }

    let mut content_offset = 0;
    let version = read_der_element(outer.value, &mut content_offset)?;
    if version.tag != 0x02 {
        return None;
    }

    let algorithm = read_der_element(outer.value, &mut content_offset)?;
    if algorithm.tag != 0x30 {
        return None;
    }
    let mut algorithm_offset = 0;
    let oid = read_der_element(algorithm.value, &mut algorithm_offset)?;
    if oid.tag != 0x06 {
        return None;
    }

    let private_key = read_der_element(outer.value, &mut content_offset)?;
    if private_key.tag != 0x04 {
        return None;
    }

    Some((oid.value, private_key.value))
}

struct DerElement<'a> {
    tag: u8,
    value: &'a [u8],
}

fn read_der_element<'a>(input: &'a [u8], offset: &mut usize) -> Option<DerElement<'a>> {
    let tag = *input.get(*offset)?;
    *offset += 1;
    let len = read_der_length(input, offset)?;
    let end = offset.checked_add(len)?;
    let value = input.get(*offset..end)?;
    *offset = end;
    Some(DerElement { tag, value })
}

fn read_der_length(input: &[u8], offset: &mut usize) -> Option<usize> {
    let first = *input.get(*offset)?;
    *offset += 1;
    if first & 0x80 == 0 {
        return Some(first as usize);
    }

    let byte_count = (first & 0x7f) as usize;
    if byte_count == 0 || byte_count > std::mem::size_of::<usize>() {
        return None;
    }

    let mut len = 0_usize;
    for _ in 0..byte_count {
        len = (len << 8) | usize::from(*input.get(*offset)?);
        *offset += 1;
    }
    Some(len)
}

fn format_ed25519_openssh_key(seed: &[u8; 32]) -> Option<String> {
    let key_pair = Ed25519KeyPair::from_seed_unchecked(seed).ok()?;
    let public_key = key_pair.public_key().as_ref();
    let mut key_material = Vec::with_capacity(64);
    key_material.extend_from_slice(seed);
    key_material.extend_from_slice(public_key);

    let mut public_blob = Vec::new();
    push_ssh_string(&mut public_blob, b"ssh-ed25519");
    push_ssh_string(&mut public_blob, public_key);

    let mut private_blob = Vec::new();
    push_ssh_u32(&mut private_blob, 0x5a5a5a5a);
    push_ssh_u32(&mut private_blob, 0x5a5a5a5a);
    push_ssh_string(&mut private_blob, b"ssh-ed25519");
    push_ssh_string(&mut private_blob, public_key);
    push_ssh_string(&mut private_blob, &key_material);
    push_ssh_string(&mut private_blob, b"sshCR imported key");

    let mut padding = 1_u8;
    while private_blob.len() % 8 != 0 {
        private_blob.push(padding);
        padding = padding.wrapping_add(1);
    }

    let mut openssh_key = Vec::new();
    openssh_key.extend_from_slice(b"openssh-key-v1\0");
    push_ssh_string(&mut openssh_key, b"none");
    push_ssh_string(&mut openssh_key, b"none");
    push_ssh_string(&mut openssh_key, b"");
    push_ssh_u32(&mut openssh_key, 1);
    push_ssh_string(&mut openssh_key, &public_blob);
    push_ssh_string(&mut openssh_key, &private_blob);

    let body = BASE64.encode(openssh_key);
    Some(format_pem("OPENSSH PRIVATE KEY", &body))
}

fn push_ssh_u32(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn push_ssh_string(output: &mut Vec<u8>, value: &[u8]) {
    push_ssh_u32(output, value.len() as u32);
    output.extend_from_slice(value);
}

fn format_pem(label: &str, base64_body: &str) -> String {
    let mut output = format!("-----BEGIN {label}-----\n");
    for chunk in base64_body.as_bytes().chunks(64) {
        output.push_str(&String::from_utf8_lossy(chunk));
        output.push('\n');
    }
    output.push_str(&format!("-----END {label}-----\n"));
    output
}

fn expand_home(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(path)
}

#[cfg(unix)]
fn set_private_key_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o600);
    fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_key_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_private_key_content;

    #[test]
    fn wraps_base64_der_private_key_as_pem() {
        let normalized = normalize_private_key_content(
            "MC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        )
        .expect("base64 DER should normalize");

        assert!(normalized.starts_with("-----BEGIN OPENSSH PRIVATE KEY-----\n"));
        assert!(normalized.ends_with("-----END OPENSSH PRIVATE KEY-----\n"));
    }

    #[test]
    fn converts_literal_newlines_in_pem() {
        let normalized = normalize_private_key_content(
            "-----BEGIN OPENSSH PRIVATE KEY-----\\nabc\\n-----END OPENSSH PRIVATE KEY-----",
        )
        .expect("PEM should normalize");

        assert!(normalized.contains("-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n"));
        assert!(normalized.ends_with('\n'));
    }
}
