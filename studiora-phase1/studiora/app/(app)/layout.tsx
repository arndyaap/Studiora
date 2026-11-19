import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider, type Theme } from "@/components/ThemeProvider";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("theme").eq("user_id", user.id).maybeSingle(),
  ]);

  const theme = (settings?.theme === "light" ? "light" : "dark") as Theme;

  return (
    <ThemeProvider initialTheme={theme}>
      <AppShell displayName={profile?.display_name ?? "Scholar"} avatarUrl={profile?.avatar_url ?? null}>
        {children}
      </AppShell>
    </ThemeProvider>
  );
}
