import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Quote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { pickQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ intro?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("skip_welcome, theme").eq("user_id", user.id).maybeSingle(),
  ]);

  // Welcome Screen selalu menjadi pembuka, kecuali pengguna memilih melewatinya di Settings.
  // ?intro=1 memaksa tampil (mis. dari tautan di Settings).
  const { intro } = await searchParams;
  if (settings?.skip_welcome && intro !== "1") redirect("/home");

  const name = profile?.display_name || profile?.username || "Scholar";
  const quote = pickQuote();

  return (
    <main className="aurora relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
      <div className="mx-auto flex w-full max-w-xl animate-fade-up flex-col items-center">
        <Logo className="mb-8" />
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gold">Learn. Explore. Evolve.</p>

        <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight sm:text-5xl">
          Selamat Datang, <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{name}</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-muted">
          Setiap pengetahuan yang kamu pelajari adalah investasi untuk dirimu di masa depan.
        </p>

        <figure className="card mt-9 w-full p-6 text-left">
          <Quote className="mb-3 h-5 w-5 text-accent" aria-hidden="true" />
          <blockquote className="text-base leading-relaxed">{quote.text}</blockquote>
          <figcaption className="mt-3 text-sm text-muted">— {quote.author}</figcaption>
        </figure>

        <Link href="/home" className="btn-primary mt-9 px-8 py-3.5 text-sm tracking-[0.2em] shadow-glow">
          MARI KITA JELAJAH
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/home" className="mt-4 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Lewati
        </Link>
      </div>
    </main>
  );
}
