import { useEffect, useState } from "react";
import { X, Server, Key, Eye, EyeOff, Star, Check, Shield } from "lucide-react";
import { createConnection, listSshKeys, updateConnection } from "../lib/api";
import type { AuthType, Connection, SshKey } from "../lib/types";
import { useI18n } from "../lib/i18n";
import { DesignSelect } from "./DesignSelect";

interface NewConnectionModalProps {
  onClose: () => void;
  onSaved: (connectionId?: string) => void;
  connection?: Connection;
}

const tagSuggestions = ["production", "dev", "staging", "infra", "web", "api", "db", "cdn", "k8s", "storage"];

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>
        {label}{required && <span style={{ color: "var(--destructive)", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ placeholder, value, onChange, type = "text", mono = false }: {
  placeholder?: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3.5 py-2.5 rounded-xl border outline-none transition-all"
      style={{
        fontSize: 13,
        fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
        backgroundColor: "var(--input-background)",
        borderColor: "var(--border)",
        color: "var(--foreground)",
      }}
      onFocus={e => (e.target.style.borderColor = "var(--primary)")}
      onBlur={e => (e.target.style.borderColor = "var(--border)")}
    />
  );
}

export function NewConnectionModal({ onClose, onSaved, connection }: NewConnectionModalProps) {
  const { t } = useI18n();
  const [host, setHost] = useState(connection?.host || "");
  const [port, setPort] = useState(String(connection?.port || 22));
  const [username, setUsername] = useState(connection?.username || "");
  const [authType, setAuthType] = useState<AuthType>(connection?.authType || "agent");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [sshKeys, setSshKeys] = useState<SshKey[]>([]);
  const [selectedKey, setSelectedKey] = useState(connection?.keyAlias || "");
  const [name, setName] = useState(connection?.name || "");
  const [tags, setTags] = useState<string[]>(connection?.tags || []);
  const [notes, setNotes] = useState(connection?.notes || "");
  const [favorite, setFavorite] = useState(Boolean(connection?.favorite));
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listSshKeys()
      .then(keys => {
        setSshKeys(keys);
        setSelectedKey(current => current || keys[0]?.name || "");
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const toggleTag = (tag: string) => {
    setTags(t => t.includes(tag) ? t.filter(x => x !== tag) : [...t, tag]);
  };

  const saveConnection = async () => {
    if (authType === "key" && !selectedKey) {
      setError(t("modalPrivateKeyRequired"));
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        host,
        port: Number.parseInt(port, 10) || 22,
        username,
        authType,
        keyAlias: authType === "key" ? selectedKey : undefined,
        favorite,
        tags,
        notes,
      };
      const saved = connection
        ? await updateConnection(connection.id, payload)
        : await createConnection(payload);
      onSaved(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[560px] rounded-3xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "var(--accent)" }}>
              <Server size={15} style={{ color: "var(--primary)" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>
                {connection ? t("modalEditConnection") : t("modalNewConnection")}
              </h2>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t("modalStep", { step })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFavorite(f => !f)}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
              style={{ backgroundColor: favorite ? "rgba(245,158,11,0.1)" : "var(--muted)", color: favorite ? "#f59e0b" : "var(--muted-foreground)" }}>
              <Star size={15} fill={favorite ? "currentColor" : "none"} />
            </button>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
              style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 py-3 gap-2" style={{ backgroundColor: "var(--muted)" }}>
          {[t("modalStepConnection"), t("modalStepDetails")].map((s, i) => (
            <button key={s} onClick={() => setStep(i + 1)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors"
              style={{
                fontSize: 12,
                fontWeight: step === i + 1 ? 500 : 400,
                backgroundColor: step === i + 1 ? "var(--card)" : "transparent",
                color: step === i + 1 ? "var(--foreground)" : "var(--muted-foreground)",
                boxShadow: step === i + 1 ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: step > i + 1 ? "var(--primary)" : step === i + 1 ? "var(--primary)" : "var(--border)",
                  fontSize: 9, color: "#fff",
                }}>
                {step > i + 1 ? <Check size={9} /> : i + 1}
              </div>
              {s}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh]" style={{ scrollbarWidth: "none" }}>
          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <FormField label={t("modalDisplayName")}>
                <Input placeholder={t("modalDisplayNamePlaceholder")} value={name} onChange={setName} />
              </FormField>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <FormField label={t("modalHost")} required>
                    <Input placeholder={t("modalHostPlaceholder")} value={host} onChange={setHost} mono />
                  </FormField>
                </div>
                <FormField label={t("modalPort")}>
                  <Input placeholder="22" value={port} onChange={setPort} mono />
                </FormField>
              </div>

              <FormField label={t("modalUsername")} required>
                <Input placeholder={t("modalUsernamePlaceholder")} value={username} onChange={setUsername} mono />
              </FormField>

              <FormField label={t("modalAuth")}>
                <div className="flex gap-2">
                  {(["key", "password", "agent"] as AuthType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setAuthType(type)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-all"
                      style={{
                        fontSize: 12,
                        borderColor: authType === type ? "var(--primary)" : "var(--border)",
                        backgroundColor: authType === type ? "var(--accent)" : "var(--input-background)",
                        color: authType === type ? "var(--primary)" : "var(--muted-foreground)",
                        fontWeight: authType === type ? 500 : 400,
                      }}>
                      {type === "key" ? <Key size={13} /> : type === "password" ? <Key size={13} /> : <Shield size={13} />}
                      {type === "key" ? t("modalAuthKey") : type === "password" ? t("modalAuthPassword") : t("modalAuthAgent")}
                    </button>
                  ))}
                </div>
              </FormField>

              {authType === "password" && (
                <FormField label={t("modalAuthPassword")}>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      placeholder={t("modalPasswordPlaceholder")}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border outline-none pr-10"
                      style={{ fontSize: 13, backgroundColor: "var(--input-background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                      onFocus={e => (e.target.style.borderColor = "var(--primary)")}
                      onBlur={e => (e.target.style.borderColor = "var(--border)")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--muted-foreground)" }}>
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </FormField>
              )}

              {authType === "key" && (
                <FormField label={t("modalPrivateKey")}>
                  <DesignSelect
                    value={selectedKey}
                    onChange={setSelectedKey}
                    options={sshKeys.map(key => ({ value: key.name, label: key.name }))}
                    placeholder={t("modalNoPrivateKeys")}
                    disabled={sshKeys.length === 0}
                    fullWidth
                    mono
                  />
                  {sshKeys.length === 0 && (
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                      {t("modalNoPrivateKeys")}
                    </span>
                  )}
                </FormField>
              )}

              {authType === "agent" && (
                <div className="p-3 rounded-xl flex items-center gap-2.5"
                  style={{ backgroundColor: "var(--accent)", borderColor: "var(--border)" }}>
                  <Check size={14} style={{ color: "var(--online)" }} />
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {t("modalAgentHint")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <FormField label={t("modalTags")}>
                <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border min-h-[44px]"
                  style={{ backgroundColor: "var(--input-background)", borderColor: "var(--border)" }}>
                  {tags.map(tag => (
                    <span key={tag}
                      onClick={() => toggleTag(tag)}
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg cursor-pointer"
                      style={{ fontSize: 11, backgroundColor: "var(--primary)", color: "#fff" }}>
                      {tag} <X size={10} />
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tagSuggestions.filter(t => !tags.includes(t)).map(tag => (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      className="px-2.5 py-1 rounded-lg transition-colors"
                      style={{ fontSize: 11, backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
                      + {tag}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label={t("modalNotes")}>
                <textarea
                  placeholder={t("modalNotesPlaceholder")}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl border outline-none resize-none"
                  style={{ fontSize: 13, backgroundColor: "var(--input-background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  onFocus={e => (e.target.style.borderColor = "var(--primary)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border)")}
                />
              </FormField>

              {/* Preview card */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)", marginBottom: 8 }}>{t("modalPreview")}</p>
                <div className="p-4 rounded-2xl border" style={{ backgroundColor: "var(--muted)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: "rgba(16,185,129,0.1)" }}>
                      <Server size={14} style={{ color: "var(--online)" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
                        {name || host || t("modalUntitled")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {username || "user"}@{host || "hostname"}:{port}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
          {error && (
            <div className="mr-auto" style={{ fontSize: 12, color: "var(--destructive)" }}>
              {error}
            </div>
          )}
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border transition-colors"
            style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--muted-foreground)", backgroundColor: "var(--card)" }}>
            {t("commonCancel")}
          </button>
          <div className="flex gap-2">
            {step === 2 && (
              <button onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl border transition-colors"
                style={{ fontSize: 13, borderColor: "var(--border)", color: "var(--foreground)", backgroundColor: "var(--card)" }}>
                {t("commonBack")}
              </button>
            )}
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!host || !username}
                className="px-5 py-2.5 rounded-xl text-white transition-all disabled:opacity-50"
                style={{ fontSize: 13, fontWeight: 500, backgroundColor: "var(--primary)" }}>
                {t("commonNext")}
              </button>
            ) : (
              <button
                onClick={saveConnection}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-white transition-all disabled:opacity-50"
                style={{ fontSize: 13, fontWeight: 500, backgroundColor: "var(--primary)" }}>
              {saving ? t("commonSaving") : connection ? t("commonSave") : t("modalSaveConnection")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
