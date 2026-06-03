use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::mpsc::Receiver,
    time::{Duration, Instant},
};

use ssh2::{FileStat, Session};
use tauri::{AppHandle, Emitter};

use crate::{
    error::{AppError, Result},
    models::{
        Connection, ConnectionTestRequest, RemoteFileEntry, SftpCreateDirectoryRequest,
        SftpDeleteRequest, SftpDownloadRequest, SftpListRequest, SftpTransferResult,
        SftpUploadRequest, TerminalConnected, TerminalExit, TerminalOutput, TerminalStartRequest,
        TestConnectionResult,
    },
    private_key::prepare_private_key_for_auth,
};

const SSH_TIMEOUT: Duration = Duration::from_secs(12);

pub async fn test_connection(request: ConnectionTestRequest) -> Result<TestConnectionResult> {
    tokio::task::spawn_blocking(move || test_connection_blocking(request))
        .await
        .map_err(|err| AppError::Task(err.to_string()))?
}

pub async fn list_directory(
    connection: Connection,
    request: SftpListRequest,
) -> Result<Vec<RemoteFileEntry>> {
    tokio::task::spawn_blocking(move || list_directory_blocking(connection, request))
        .await
        .map_err(|err| AppError::Task(err.to_string()))?
}

pub async fn create_directory(
    connection: Connection,
    request: SftpCreateDirectoryRequest,
) -> Result<()> {
    tokio::task::spawn_blocking(move || create_directory_blocking(connection, request))
        .await
        .map_err(|err| AppError::Task(err.to_string()))?
}

pub async fn delete_paths(connection: Connection, request: SftpDeleteRequest) -> Result<()> {
    tokio::task::spawn_blocking(move || delete_paths_blocking(connection, request))
        .await
        .map_err(|err| AppError::Task(err.to_string()))?
}

pub async fn upload_file(
    connection: Connection,
    request: SftpUploadRequest,
) -> Result<SftpTransferResult> {
    tokio::task::spawn_blocking(move || upload_file_blocking(connection, request))
        .await
        .map_err(|err| AppError::Task(err.to_string()))?
}

pub async fn download_file(
    connection: Connection,
    request: SftpDownloadRequest,
) -> Result<SftpTransferResult> {
    tokio::task::spawn_blocking(move || download_file_blocking(connection, request))
        .await
        .map_err(|err| AppError::Task(err.to_string()))?
}

pub fn run_terminal(
    connection: Connection,
    request: TerminalStartRequest,
    stdin: Receiver<String>,
    app: AppHandle,
    session_id: String,
) -> Result<()> {
    let session = connect_with_saved_connection(
        &connection,
        request.password.as_deref(),
        request.passphrase.as_deref(),
    )?;
    let keep_alive_interval = request.keep_alive_interval.unwrap_or(60).clamp(30, 300);
    let keep_alive_enabled = request.keep_alive.unwrap_or(false);
    if keep_alive_enabled {
        session.set_keepalive(false, keep_alive_interval);
    }

    let mut channel = session.channel_session()?;
    channel.handle_extended_data(ssh2::ExtendedData::Merge)?;
    channel.request_pty(
        "xterm-256color",
        None,
        Some((
            request.cols.unwrap_or(120),
            request.rows.unwrap_or(32),
            0,
            0,
        )),
    )?;
    channel.shell()?;
    session.set_blocking(false);

    app.emit(
        "terminal-connected",
        TerminalConnected {
            session_id: session_id.clone(),
            connection_id: connection.id.clone(),
        },
    )?;

    app.emit(
        "terminal-output",
        TerminalOutput {
            session_id: session_id.clone(),
            data: format!(
                "Connected to {} ({}:{})\r\n",
                connection.name, connection.host, connection.port
            ),
        },
    )?;

    let mut buffer = [0_u8; 8192];
    let mut last_keep_alive = Instant::now();
    loop {
        match channel.read(&mut buffer) {
            Ok(0) => {
                if channel.eof() {
                    break;
                }
            }
            Ok(count) => {
                let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                app.emit(
                    "terminal-output",
                    TerminalOutput {
                        session_id: session_id.clone(),
                        data,
                    },
                )?;
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(err) => return Err(AppError::Io(err)),
        }

        while let Ok(data) = stdin.try_recv() {
            if data == "\u{4}" {
                channel.close()?;
                break;
            }

            match channel.write_all(data.as_bytes()) {
                Ok(()) => {}
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(err) => return Err(AppError::Io(err)),
            }
            let _ = channel.flush();
        }

        if channel.eof() {
            break;
        }

        if keep_alive_enabled
            && last_keep_alive.elapsed() >= Duration::from_secs(u64::from(keep_alive_interval))
        {
            let _ = session.keepalive_send();
            last_keep_alive = Instant::now();
        }

        std::thread::sleep(Duration::from_millis(8));
    }

    app.emit(
        "terminal-exit",
        TerminalExit {
            session_id,
            message: "SSH session closed".into(),
        },
    )?;

    Ok(())
}

fn test_connection_blocking(request: ConnectionTestRequest) -> Result<TestConnectionResult> {
    let started = Instant::now();
    let session = connect_session(
        &request.host,
        request.port,
        &request.username,
        &request.auth_type,
        request.password.as_deref(),
        request.key_path.as_deref(),
        request.passphrase.as_deref(),
    )?;
    let os = read_remote_os(&session).ok();
    let latency_ms = started.elapsed().as_millis() as u64;

    Ok(TestConnectionResult {
        ok: true,
        latency_ms,
        os,
        message: "connection successful".into(),
    })
}

fn list_directory_blocking(
    connection: Connection,
    request: SftpListRequest,
) -> Result<Vec<RemoteFileEntry>> {
    let session = connect_with_saved_connection(
        &connection,
        request.password.as_deref(),
        request.passphrase.as_deref(),
    )?;
    let sftp = session.sftp()?;
    let base = Path::new(&request.path);
    let entries = sftp.readdir(base)?;

    let mut files = entries
        .into_iter()
        .filter_map(|(path, stat)| {
            let name = path.file_name()?.to_string_lossy().to_string();
            if name == "." || name == ".." {
                return None;
            }

            let entry_path = join_remote_path(&request.path, &name);
            let entry_type = if is_dir(stat.perm) { "dir" } else { "file" }.to_string();
            let extension = path
                .extension()
                .map(|ext| ext.to_string_lossy().to_string())
                .filter(|_| entry_type == "file");

            Some(RemoteFileEntry {
                name,
                path: entry_path,
                entry_type,
                size: stat.size,
                modified: stat.mtime.map(|mtime| mtime.to_string()),
                permissions: format_permissions(stat.perm),
                extension,
            })
        })
        .collect::<Vec<_>>();

    files.sort_by(|a, b| {
        b.entry_type
            .cmp(&a.entry_type)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

fn create_directory_blocking(
    connection: Connection,
    request: SftpCreateDirectoryRequest,
) -> Result<()> {
    let remote_path = sanitize_remote_path(&request.path)?;
    let session = connect_with_saved_connection(
        &connection,
        request.password.as_deref(),
        request.passphrase.as_deref(),
    )?;
    let sftp = session.sftp()?;
    sftp.mkdir(Path::new(&remote_path), 0o755)?;
    Ok(())
}

fn delete_paths_blocking(connection: Connection, request: SftpDeleteRequest) -> Result<()> {
    if request.paths.is_empty() {
        return Err(AppError::InvalidInput("no remote paths selected".into()));
    }

    let session = connect_with_saved_connection(
        &connection,
        request.password.as_deref(),
        request.passphrase.as_deref(),
    )?;
    let sftp = session.sftp()?;

    for path in request.paths {
        let remote_path = sanitize_remote_path(&path)?;
        delete_remote_path(&sftp, Path::new(&remote_path))?;
    }

    Ok(())
}

fn upload_file_blocking(
    connection: Connection,
    request: SftpUploadRequest,
) -> Result<SftpTransferResult> {
    let local_path = PathBuf::from(expand_home(&request.local_path));
    if !local_path.is_file() {
        return Err(AppError::InvalidInput(format!(
            "local file not found: {}",
            request.local_path
        )));
    }

    let remote_path = sanitize_remote_path(&request.remote_path)?;
    let session = connect_with_saved_connection(
        &connection,
        request.password.as_deref(),
        request.passphrase.as_deref(),
    )?;
    let sftp = session.sftp()?;
    let mut local_file = std::fs::File::open(&local_path)?;
    let mut remote_file = sftp.create(Path::new(&remote_path))?;
    let bytes = std::io::copy(&mut local_file, &mut remote_file)?;
    remote_file.flush()?;

    Ok(SftpTransferResult {
        path: remote_path,
        bytes,
    })
}

fn download_file_blocking(
    connection: Connection,
    request: SftpDownloadRequest,
) -> Result<SftpTransferResult> {
    let remote_path = sanitize_remote_path(&request.remote_path)?;
    let local_path = PathBuf::from(expand_home(&request.local_path));
    if let Some(parent) = local_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let session = connect_with_saved_connection(
        &connection,
        request.password.as_deref(),
        request.passphrase.as_deref(),
    )?;
    let sftp = session.sftp()?;
    let mut remote_file = sftp.open(Path::new(&remote_path))?;
    let mut local_file = std::fs::File::create(&local_path)?;
    let bytes = std::io::copy(&mut remote_file, &mut local_file)?;
    local_file.flush()?;

    Ok(SftpTransferResult {
        path: remote_path,
        bytes,
    })
}

fn connect_with_saved_connection(
    connection: &Connection,
    password: Option<&str>,
    passphrase: Option<&str>,
) -> Result<Session> {
    connect_session(
        &connection.host,
        connection.port,
        &connection.username,
        &connection.auth_type,
        password.or(connection.saved_password.as_deref()),
        connection.key_path.as_deref(),
        passphrase,
    )
}

fn connect_session(
    host: &str,
    port: u16,
    username: &str,
    auth_type: &str,
    password: Option<&str>,
    key_path: Option<&str>,
    passphrase: Option<&str>,
) -> Result<Session> {
    let tcp = connect_tcp(host, port)?;
    tcp.set_read_timeout(Some(SSH_TIMEOUT))?;
    tcp.set_write_timeout(Some(SSH_TIMEOUT))?;

    let mut session = Session::new()?;
    session.set_tcp_stream(tcp);
    session.set_timeout(SSH_TIMEOUT.as_millis() as u32);
    session.handshake()?;

    authenticate(
        &session, username, auth_type, password, key_path, passphrase,
    )?;

    Ok(session)
}

fn connect_tcp(host: &str, port: u16) -> Result<TcpStream> {
    let mut last_error = None;
    for address in (host, port).to_socket_addrs()? {
        match TcpStream::connect_timeout(&address, SSH_TIMEOUT) {
            Ok(stream) => return Ok(stream),
            Err(err) => last_error = Some(err),
        }
    }

    Err(last_error
        .unwrap_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "host not resolved"))
        .into())
}

fn authenticate(
    session: &Session,
    username: &str,
    auth_type: &str,
    password: Option<&str>,
    key_path: Option<&str>,
    passphrase: Option<&str>,
) -> Result<()> {
    match auth_type {
        "password" => {
            let password = password.ok_or_else(|| {
                AppError::CredentialsRequired("password authentication needs a password".into())
            })?;
            session.userauth_password(username, password)?;
        }
        "key" => {
            let key_path = key_path.ok_or_else(|| {
                AppError::CredentialsRequired("key authentication needs a private key path".into())
            })?;
            let prepared_key = prepare_private_key_for_auth(key_path)?;
            session.userauth_pubkey_file(username, None, prepared_key.path(), passphrase)?;
        }
        "agent" => authenticate_with_agent(session, username)?,
        other => {
            return Err(AppError::InvalidInput(format!(
                "unsupported auth type {other}"
            )))
        }
    }

    if session.authenticated() {
        Ok(())
    } else {
        Err(AppError::Ssh2(ssh2::Error::new(
            ssh2::ErrorCode::Session(-18),
            "authentication failed",
        )))
    }
}

fn authenticate_with_agent(session: &Session, username: &str) -> Result<()> {
    let mut agent = session.agent()?;
    agent.connect()?;
    agent.list_identities()?;

    for identity in agent.identities()? {
        if agent.userauth(username, &identity).is_ok() && session.authenticated() {
            return Ok(());
        }
    }

    Err(AppError::CredentialsRequired(
        "no matching identity found in ssh-agent".into(),
    ))
}

fn read_remote_os(session: &Session) -> Result<String> {
    let mut channel = session.channel_session()?;
    channel.exec("uname -srm 2>/dev/null || uname -a")?;
    let mut output = String::new();
    channel.read_to_string(&mut output)?;
    channel.wait_close()?;
    Ok(output.trim().to_string())
}

fn is_dir(perm: Option<u32>) -> bool {
    perm.map(|mode| mode & 0o170000 == 0o040000)
        .unwrap_or(false)
}

fn format_permissions(perm: Option<u32>) -> String {
    let Some(mode) = perm else {
        return "---------".into();
    };

    let file_type = if mode & 0o170000 == 0o040000 {
        'd'
    } else {
        '-'
    };
    let bits = [
        (0o400, 'r'),
        (0o200, 'w'),
        (0o100, 'x'),
        (0o040, 'r'),
        (0o020, 'w'),
        (0o010, 'x'),
        (0o004, 'r'),
        (0o002, 'w'),
        (0o001, 'x'),
    ];

    let mut rendered = String::with_capacity(10);
    rendered.push(file_type);
    for (bit, label) in bits {
        rendered.push(if mode & bit != 0 { label } else { '-' });
    }
    rendered
}

fn join_remote_path(base: &str, name: &str) -> String {
    if base == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", base.trim_end_matches('/'), name)
    }
}

fn sanitize_remote_path(path: &str) -> Result<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("remote path is required".into()));
    }
    if !trimmed.starts_with('/') {
        return Err(AppError::InvalidInput(format!(
            "remote path must be absolute: {trimmed}"
        )));
    }
    Ok(trimmed.to_string())
}

fn expand_home(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed == "~" {
        std::env::var("HOME").unwrap_or_else(|_| trimmed.to_string())
    } else if let Some(rest) = trimmed.strip_prefix("~/") {
        std::env::var("HOME")
            .map(|home| format!("{home}/{rest}"))
            .unwrap_or_else(|_| trimmed.to_string())
    } else {
        trimmed.to_string()
    }
}

fn delete_remote_path(sftp: &ssh2::Sftp, path: &Path) -> Result<()> {
    let stat = sftp.stat(path)?;
    if is_dir(stat.perm) {
        let children = sftp.readdir(path)?;
        for (child_path, child_stat) in children {
            let Some(name) = child_path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if name == "." || name == ".." {
                continue;
            }
            delete_remote_path_with_stat(sftp, &child_path, child_stat)?;
        }
        sftp.rmdir(path)?;
    } else {
        sftp.unlink(path)?;
    }
    Ok(())
}

fn delete_remote_path_with_stat(sftp: &ssh2::Sftp, path: &Path, stat: FileStat) -> Result<()> {
    if is_dir(stat.perm) {
        let children = sftp.readdir(path)?;
        for (child_path, child_stat) in children {
            let Some(name) = child_path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if name == "." || name == ".." {
                continue;
            }
            delete_remote_path_with_stat(sftp, &child_path, child_stat)?;
        }
        sftp.rmdir(path)?;
    } else {
        sftp.unlink(path)?;
    }
    Ok(())
}
