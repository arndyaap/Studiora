"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";

type Props = {
  userId: string;
  initial: { display_name: string; username: string | null; bio: string; avatar_url: string | null; email: string | null };
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function ProfileEditor({ userId, initial }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    display_name: initial.display_name,
    username: initial.username ?? "",
    bio: initial.bio,
  });
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const display_name = form.display_name.trim();
    const username = form.username.trim().toLowerCase();
    if (display_name.length < 1 || display_name.length > 60) {
      setMsg({ type: "err", text: "Display name wajib diisi (maks. 60 karakter)." });
      return;
    }
    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      setMsg({ type: "err", text: "Username 3–30 karakter: huruf kecil, angka, atau garis bawah." });
      return;
    }
    if (form.bio.length > 300) {
      setMsg({ type: "err", text: "Biografi maksimal 300 karakter." });
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name, username: username || null, bio: form.bio.trim() })
      .eq("id", userId);
    setSaving(false);

    if (error) {
      setMsg({
        type: "err",
        text: error.code === "23505" ? "Username sudah dipakai." : "Gagal menyimpan profil. Coba lagi.",
      });
      return;
    }
    setMsg({ type: "ok", text: "Profil tersimpan." });
    setEditing(false);
    router.refresh();
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMsg({ type: "err", text: "Format avatar harus JPG, PNG, atau WebP." });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setMsg({ type: "err", text: "Ukuran avatar maksimal 2 MB." });
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      setMsg({ type: "err", text: "Gagal mengunggah avatar. Pastikan migrasi database sudah dijalankan." });
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
    setUploading(false);
    if (error) {
      setMsg({ type: "err", text: "Avatar terunggah tetapi gagal disimpan ke profil." });
      return;
    }
    setAvatarUrl(data.publicUrl);
    setMsg({ type: "ok", text: "Avatar diperbarui." });
    router.refresh();
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="relative shrink-0 self-start">
          <Avatar name={form.display_name || "Scholar"} url={avatarUrl} size={96} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Ganti avatar"
            className="absolute -bottom-1 -right-1 rounded-full border border-line/30 bg-surface p-2 shadow-card transition hover:bg-surface2 active:scale-90"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickAvatar} />
        </div>

        {!editing ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl font-extrabold">{form.display_name}</h2>
                <p className="text-sm text-muted">
                  {form.username ? `@${form.username}` : "Belum ada username"}
                  {initial.email ? ` · ${initial.email}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-3 py-2 text-xs">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {form.bio || "Tambahkan biografi singkat tentang tujuan belajarmu."}
            </p>
          </div>
        ) : (
          <form onSubmit={save} className="min-w-0 flex-1 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="dn">Display Name</label>
                <input id="dn" className="input" maxLength={60} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
              </div>
              <div>
                <label className="label" htmlFor="un">Username</label>
                <input id="un" className="input" maxLength={30} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="mis. scholar_01" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="bio">Personal Biography</label>
              <textarea id="bio" className="input min-h-24" maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              <p className="mt-1 text-right text-[11px] text-muted">{form.bio.length}/300</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Simpan
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setForm({ display_name: initial.display_name, username: initial.username ?? "", bio: initial.bio });
                }}
              >
                <X className="h-4 w-4" /> Batal
              </button>
            </div>
          </form>
        )}
      </div>

      {msg && (
        <p role="status" className={`mt-4 text-sm ${msg.type === "ok" ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
