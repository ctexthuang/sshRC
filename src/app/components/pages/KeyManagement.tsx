import { useEffect, useState } from "react";
import { Key, Plus, Copy, Trash2, Download, Shield, Server, Check, Upload, ChevronRight, X, Pencil } from "lucide-react";
import { createSshKey, deleteSshKey, listSshKeys, updateSshKey } from "../../lib/api";
import type { SshKey, SshKeyPayload } from "../../lib/types";
import { useI18n } from "../../lib/i18n";
import { DesignSelect } from "../DesignSelect";

interface KeyCard {
  id: string;
  name: string;
  type: string;
  fingerprint: string;
  created: string;
  comment: string;
  keyPath: string;
  inUse: string[];
  hasPrivate: boolean;
  encrypted: boolean;
  publicKey?: string;
}

const typeColors: Record<string, { bg: string; text: string }> = {
  "ED25519": { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  "RSA 4096": { bg: "rgba(37,99,235,0.1)", text: "#2563eb" },
  "ECDSA": { bg: "rgba(139,92,246,0.1)", text: "#8b5cf6" },
};

export function KeyManagement() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<KeyCard[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"import" | "generate" | null>(null);
  const [editingKey, setEditingKey] = useState<KeyCard | null>(null);
  const [deletingKey, setDeletingKey] = useState<KeyCard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    listSshKeys()
      .then(items => {
        setKeys(items.map(key => toKeyCard(key, t)));
        setError("");
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, [t, refreshToken]);

  const copyFingerprint = (key: KeyCard) => {
    void navigator.clipboard?.writeText(key.fingerprint);
    setCopied(key.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyPublicKey = (key: KeyCard) => {
    const text = key.publicKey || buildPreviewPublicKey(key.type, key.comment);
    void navigator.clipboard?.writeText(text);
    setCopied(key.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const exportPublicKey = (key: KeyCard) => {
    const text = key.publicKey || buildPreviewPublicKey(key.type, key.comment);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${key.name}.pub`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaved = () => {
    setModalMode(null);
    setRefreshToken(token => token + 1);
  };

  const requestDelete = (key: KeyCard) => {
    setDeletingKey(key);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!deletingKey) return;
    setDeleting(true);
    setDeleteError("");
    setError("");
    try {
      await deleteSshKey(deletingKey.id);
      setActiveKey(null);
      setDeletingKey(null);
      setRefreshToken(token => token + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteError(message);
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="p-5 lg:p-7 max-w-[900px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--foreground)" }}>{t("keysTitle")}</h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>{t("keysSubtitle", { count: keys.length })}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModalMode("import")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-colors"
              style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}>
              <Upload size={14} /> {t("commonImport")}
            </button>
            <button
              onClick={() => setModalMode("generate")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--primary)", fontSize: 13, fontWeight: 500 }}>
              <Plus size={15} /> {t("keysGenerate")}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-xl border"
            style={{ fontSize: 12, color: "var(--destructive)", borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            {error}
          </div>
        )}

        {/* Info banner */}
        <div className="rounded-2xl p-4 border mb-6 flex items-start gap-3"
          style={{ backgroundColor: "var(--accent)", borderColor: "rgba(37,99,235,0.15)" }}>
          <Shield size={16} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{t("keysBannerTitle")}</p>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
              {t("keysBannerText")}
            </p>
          </div>
        </div>

        {/* Keys list */}
        <div className="flex flex-col gap-3">
          {keys.map(key => (
            <div
              key={key.id}
              className="rounded-2xl border overflow-hidden transition-all"
              style={{ backgroundColor: "var(--card)", borderColor: activeKey === key.id ? "var(--primary)" : "var(--border)" }}
            >
              <div
                className="p-4 cursor-pointer"
                onClick={() => setActiveKey(activeKey === key.id ? null : key.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: typeColors[key.type]?.bg || "var(--muted)" }}>
                      <Key size={17} style={{ color: typeColors[key.type]?.text || "var(--muted-foreground)" }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>{key.name}</span>
                        <span className="px-2 py-0.5 rounded-lg"
                          style={{ fontSize: 10, ...typeColors[key.type], backgroundColor: typeColors[key.type]?.bg }}>
                          {key.type}
                        </span>
                        {key.hasPrivate && (
                          <span className="px-2 py-0.5 rounded-lg"
                            style={{ fontSize: 10, backgroundColor: "rgba(16,185,129,0.1)", color: "var(--online)" }}>
                            {t("keysPublicPrivate")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{key.comment}</span>
                        <span style={{ color: "var(--border)" }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t("keysAdded", { date: key.created })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        setEditingKey(key);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                      style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
                      title={t("commonEdit")}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        requestDelete(key);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                      style={{ color: "var(--destructive)", backgroundColor: "rgba(239,68,68,0.08)" }}
                      title={t("commonDelete")}
                    >
                      <Trash2 size={12} />
                    </button>
                    <ChevronRight size={16} style={{
                      color: "var(--muted-foreground)",
                      transform: activeKey === key.id ? "rotate(90deg)" : "rotate(0)",
                      transition: "transform 0.2s",
                    }} />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
                      {key.fingerprint}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); copyFingerprint(key); }}
                      className="w-5 h-5 flex items-center justify-center rounded-md transition-colors flex-shrink-0"
                      style={{ color: "var(--muted-foreground)" }}>
                      {copied === key.id ? <Check size={11} style={{ color: "var(--online)" }} /> : <Copy size={11} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t("keysUsedBy")}</span>
                    {key.inUse.map(host => (
                      <span key={host} className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
                        style={{ fontSize: 10, backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
                        <Server size={9} /> {host}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {activeKey === key.id && (
                <div className="px-4 pb-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{t("keysPublicPreview")}</p>
                      <div className="p-3 rounded-xl font-mono text-xs overflow-hidden"
                        style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)", fontSize: 11, lineHeight: 1.5, wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace" }}>
                        {key.publicKey || `${key.type.startsWith("ED") ? "ssh-ed25519" : key.type.startsWith("EC") ? "ecdsa-sha2-nistp256" : "ssh-rsa"} AAAAB3NzaC1yc2EAAAADAQABAAABgQC7...truncated... ${key.comment}`}
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{t("keysUsedOnHosts")}</p>
                      <div className="flex flex-col gap-1.5">
                        {key.inUse.map(host => (
                          <div key={host} className="flex items-center gap-2 p-2 rounded-xl"
                            style={{ backgroundColor: "var(--muted)" }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--online)" }} />
                            <span style={{ fontSize: 12, color: "var(--foreground)" }}>{host}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyPublicKey(key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors"
                      style={{ fontSize: 12, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}>
                      <Copy size={12} /> {t("keysCopyPublic")}
                    </button>
                    <button
                      onClick={() => exportPublicKey(key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors"
                      style={{ fontSize: 12, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}>
                      <Download size={12} /> {t("commonExport")}
                    </button>
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        requestDelete(key);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors ml-auto"
                      style={{ fontSize: 12, color: "var(--destructive)", backgroundColor: "rgba(239,68,68,0.08)" }}>
                      <Trash2 size={12} /> {t("commonDelete")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {modalMode && (
        <SshKeyModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSaved={handleSaved}
          onError={setError}
        />
      )}
      {editingKey && (
        <SshKeyModal
          mode="import"
          keyRecord={editingKey}
          onClose={() => setEditingKey(null)}
          onSaved={() => {
            setEditingKey(null);
            handleSaved();
          }}
          onError={setError}
        />
      )}
      {deletingKey && (
        <SshKeyDeleteDialog
          keyRecord={deletingKey}
          deleting={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) {
              setDeletingKey(null);
              setDeleteError("");
            }
          }}
          onConfirm={() => void confirmDelete()}
          t={t}
        />
      )}
    </div>
  );
}

function SshKeyDeleteDialog({
  keyRecord,
  deleting,
  error,
  onCancel,
  onConfirm,
  t,
}: {
  keyRecord: KeyCard;
  deleting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[430px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "var(--destructive)" }}
          >
            <Trash2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)" }}>
              {t("keysDeleteTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.55 }}>
              {t("keysDeleteMessage", { name: keyRecord.name })}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
            style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4">
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{keyRecord.name}</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                marginTop: 4,
                wordBreak: "break-all",
              }}
            >
              {keyRecord.keyPath}
            </div>
          </div>
          {error && (
            <div
              className="mt-3 rounded-2xl border px-4 py-3"
              style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "var(--destructive)", fontSize: 12 }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 pt-1">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-xl border transition-colors disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", fontSize: 13 }}
          >
            {t("commonCancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-white transition-all disabled:opacity-60 active:scale-95"
            style={{ backgroundColor: "var(--destructive)", fontSize: 13, fontWeight: 500 }}
          >
            {deleting ? t("keysDeleting") : t("commonDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SshKeyModalProps {
  mode: "import" | "generate";
  keyRecord?: KeyCard;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

function SshKeyModal({ mode, keyRecord, onClose, onSaved, onError }: SshKeyModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(keyRecord?.name || (mode === "generate" ? "sshRC-ed25519" : ""));
  const [keyPath, setKeyPath] = useState(keyRecord?.keyPath || (mode === "generate" ? "~/.ssh/sshRC_ed25519" : ""));
  const [algorithm, setAlgorithm] = useState(keyRecord?.type || "ED25519");
  const [comment, setComment] = useState(keyRecord?.comment.includes("/") ? "sshRC@local" : keyRecord?.comment || "sshRC@local");
  const [publicKey, setPublicKey] = useState(keyRecord?.publicKey || "");
  const [fingerprint, setFingerprint] = useState(keyRecord?.fingerprint || "");
  const [encrypted, setEncrypted] = useState(keyRecord?.encrypted ?? true);
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);

  const effectivePublicKey = publicKey || buildPreviewPublicKey(algorithm, comment);
  const effectiveFingerprint = fingerprint || buildPreviewFingerprint(name || keyPath || "sshRC");

  const save = async () => {
    if (!name.trim() || !keyPath.trim()) {
      setLocalError(t("keysRequired"));
      return;
    }

    const payload: SshKeyPayload = {
      name: name.trim(),
      keyPath: keyPath.trim(),
      publicKey: effectivePublicKey,
      fingerprint: effectiveFingerprint,
      encrypted,
    };

    setSaving(true);
    setLocalError("");
    try {
      if (keyRecord) {
        await updateSshKey(keyRecord.id, payload);
      } else {
        await createSshKey(payload);
      }
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <div className="w-full max-w-[560px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--accent)" }}>
              {mode === "import" ? <Upload size={15} style={{ color: "var(--primary)" }} /> : <Key size={15} style={{ color: "var(--primary)" }} />}
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>
                {keyRecord ? t("keysEditTitle") : mode === "import" ? t("keysImportTitle") : t("keysGenerateTitle")}
              </h2>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t("keysFormHint")}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
            style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <ModalField label={t("keysName")} required>
            <ModalInput value={name} onChange={setName} placeholder={t("keysNamePlaceholder")} />
          </ModalField>

          <ModalField label={t("keysPath")} required>
            <ModalInput value={keyPath} onChange={setKeyPath} placeholder={t("keysPathPlaceholder")} mono />
          </ModalField>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label={t("keysAlgorithm")}>
              <DesignSelect
                value={algorithm}
                onChange={setAlgorithm}
                options={["ED25519", "RSA 4096", "ECDSA"].map(item => ({ value: item, label: item }))}
                fullWidth
              />
            </ModalField>
            <ModalField label={t("keysComment")}>
              <ModalInput value={comment} onChange={setComment} placeholder={t("keysCommentPlaceholder")} />
            </ModalField>
          </div>

          {mode === "import" && (
            <>
              <ModalField label={t("keysPublicKey")}>
                <textarea
                  value={publicKey}
                  onChange={event => setPublicKey(event.target.value)}
                  placeholder={t("keysPublicKeyPlaceholder")}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl border outline-none resize-none"
                  style={{ fontSize: 12, fontFamily: "var(--font-mono)", backgroundColor: "var(--input-background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
              </ModalField>
              <ModalField label={t("keysFingerprint")}>
                <ModalInput value={fingerprint} onChange={setFingerprint} placeholder={t("keysFingerprintPlaceholder")} mono />
              </ModalField>
            </>
          )}

          <button
            onClick={() => setEncrypted(value => !value)}
            className="flex items-center gap-2 text-left"
            style={{ color: "var(--foreground)", fontSize: 13 }}
          >
            <span className="w-4 h-4 rounded border flex items-center justify-center"
              style={{ borderColor: encrypted ? "var(--primary)" : "var(--border)", backgroundColor: encrypted ? "var(--primary)" : "transparent" }}>
              {encrypted && <Check size={11} style={{ color: "#fff" }} />}
            </span>
            {t("keysEncrypted")}
          </button>

          <div className="p-3 rounded-xl"
            style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
            {effectivePublicKey}
          </div>

          {localError && <div style={{ fontSize: 12, color: "var(--destructive)" }}>{localError}</div>}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border transition-colors"
            style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}>
            {t("commonCancel")}
          </button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 rounded-xl text-white transition-all disabled:opacity-50"
            style={{ fontSize: 13, fontWeight: 500, backgroundColor: "var(--primary)" }}>
            {saving ? t("commonSaving") : keyRecord ? t("commonSave") : mode === "import" ? t("keysImportSubmit") : t("keysGenerateSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>
        {label}{required && <span style={{ color: "var(--destructive)", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function ModalInput({ value, onChange, placeholder, mono }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full px-3.5 py-2.5 rounded-xl border outline-none"
      style={{
        fontSize: 13,
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        backgroundColor: "var(--input-background)",
        borderColor: "var(--border)",
        color: "var(--foreground)",
      }}
    />
  );
}

function buildPreviewPublicKey(algorithm: string, comment: string) {
  const prefix = algorithm === "ED25519" ? "ssh-ed25519" : algorithm === "ECDSA" ? "ecdsa-sha2-nistp256" : "ssh-rsa";
  const body = algorithm === "ED25519"
    ? "AAAAC3NzaC1lZDI1NTE5AAAAIPreviewGeneratedKey"
    : "AAAAB3NzaC1yc2EAAAADAQABAAABAQCPreviewGeneratedKey";
  return `${prefix} ${body} ${comment || "sshRC@local"}`;
}

function buildPreviewFingerprint(seed: string) {
  const encoded = btoa(unescape(encodeURIComponent(seed))).replace(/=+$/, "");
  return `SHA256:${encoded.slice(0, 32)}`;
}

function toKeyCard(key: SshKey, t: (key: string) => string): KeyCard {
  const publicKey = key.publicKey || "";
  const type = publicKey.startsWith("ssh-ed25519")
    ? "ED25519"
    : publicKey.startsWith("ecdsa")
      ? "ECDSA"
      : "RSA 4096";
  const parts = publicKey.split(/\s+/);

  return {
    id: key.id,
    name: key.name,
    type,
    fingerprint: key.fingerprint || t("keysFingerprintPending"),
    created: formatDate(key.createdAt),
    comment: parts[2] || key.keyPath,
    keyPath: key.keyPath,
    inUse: [],
    hasPrivate: Boolean(key.keyPath),
    encrypted: key.encrypted,
    publicKey,
  };
}

function formatDate(value: string) {
  if (!value) return "-";
  return value.includes("T") ? value.split("T")[0] : value.split(" ")[0];
}
