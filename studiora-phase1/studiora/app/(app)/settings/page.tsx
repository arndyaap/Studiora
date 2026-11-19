import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("user_settings")
    .select("theme,skip_welcome,notifications_enabled,daily_goal_minutes,weekly_goal_minutes")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Settings</h1>
      <SettingsClient
        userId={user!.id}
        initial={{
          theme: data?.theme === "light" ? "light" : "dark",
          skip_welcome: data?.skip_welcome ?? false,
          notifications_enabled: data?.notifications_enabled ?? true,
          daily_goal_minutes: data?.daily_goal_minutes ?? 60,
          weekly_goal_minutes: data?.weekly_goal_minutes ?? 420,
        }}
      />
    </div>
  );
}
