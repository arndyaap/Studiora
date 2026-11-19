import { Logo } from "@/components/Logo";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main className="aurora flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="card w-full max-w-xl animate-fade-up p-7">
        <Logo className="mb-5" />
        <h1 className="font-display text-xl font-bold">Hubungkan Supabase</h1>
        <p className="mt-1 text-sm text-muted">
          {configured
            ? "Konfigurasi terdeteksi. Muat ulang halaman untuk masuk."
            : "STUDIORA belum terhubung ke database, jadi belum ada data yang bisa disimpan."}
        </p>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Buat proyek di <span className="font-semibold">supabase.com</span>, lalu jalankan isi{" "}
            <code className="rounded bg-surface2/60 px-1.5 py-0.5">supabase/migrations/0001_init.sql</code> di SQL Editor.
          </li>
          <li>
            Di <span className="font-semibold">Authentication → Sign In / Providers</span>, nonaktifkan{" "}
            <em>Allow new users to sign up</em>, lalu buat akunmu lewat <em>Users → Add user</em>.
          </li>
          <li>
            Salin <code className="rounded bg-surface2/60 px-1.5 py-0.5">.env.example</code> menjadi{" "}
            <code className="rounded bg-surface2/60 px-1.5 py-0.5">.env.local</code> dan isi URL serta anon key.
          </li>
          <li>Jalankan ulang server (atau redeploy), lalu masuk di halaman login.</li>
        </ol>
      </div>
    </main>
  );
}
