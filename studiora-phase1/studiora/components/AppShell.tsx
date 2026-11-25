"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  Gift,
  Home,
  Library,
  MoreHorizontal,
  NotebookPen,
  Settings,
  Swords,
  Timer,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const MAIN: NavItem[] = [
  { href: "/home", label: "Beranda", icon: Home },
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/materi", label: "Materi", icon: BookOpen },
  { href: "/misi", label: "Misi", icon: Swords },
  { href: "/profile", label: "Profile", icon: User },
];

const MORE: NavItem[] = [
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/library", label: "Library", icon: Library },
  { href: "/focus", label: "Focus Room", icon: Timer },
  { href: "/notes", label: "Quick Notes", icon: NotebookPen },
  { href: "/rewards", label: "Reward Shop", icon: Gift },
  { href: "/achievements", label: "Achievements", icon: Award },
  { href: "/settings", label: "Settings", icon: Settings },
];

function active(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  displayName,
  avatarUrl,
  children,
}: {
  displayName: string;
  avatarUrl: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  const moreActive = MORE.some((m) => active(pathname, m.href));

  return (
    <div className="min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line/15 bg-surface/70 p-5 backdrop-blur-md lg:flex">
        <Logo className="mb-8 px-2" />
        <nav className="flex flex-1 flex-col gap-1" aria-label="Navigasi utama">
          {[...MAIN, ...MORE].map((item) => (
            <SideLink key={item.href} item={item} isActive={active(pathname, item.href)} />
          ))}
        </nav>
        <Link
          href="/profile"
          className="mt-4 flex items-center gap-3 rounded-xl border border-line/15 p-2.5 transition hover:bg-surface2/50"
        >
          <Avatar name={displayName} url={avatarUrl} size={36} />
          <span className="truncate text-sm font-semibold">{displayName}</span>
        </Link>
      </aside>

      {/* Header mobile/tablet */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/15 bg-bg/80 px-4 py-3 backdrop-blur-md lg:hidden">
        <Logo />
        <NotificationBell />
      </header>

      {/* Bilah atas desktop (notifikasi) */}
      <div className="fixed right-6 top-5 z-20 hidden lg:block">
        <NotificationBell />
      </div>

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* Bottom navigation mobile */}
      <nav
        aria-label="Navigasi utama"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line/15 bg-surface/90 backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-6">
          {MAIN.map((item) => (
            <li key={item.href}>
              <BottomLink item={item} isActive={active(pathname, item.href)} />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition",
                moreActive ? "text-primary" : "text-muted",
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* More menu */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu tambahan">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMoreOpen(false)}
          />
          <div className="safe-bottom absolute inset-x-0 bottom-0 animate-fade-up rounded-t-3xl border-t border-line/20 bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Menu</h2>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-1.5 hover:bg-surface2/60" aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border border-line/15 px-2 py-4 text-xs font-medium transition hover:bg-surface2/50",
                    active(pathname, item.href) && "border-primary/50 text-primary",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SideLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        isActive ? "bg-primary/15 text-primary" : "text-muted hover:bg-surface2/50 hover:text-ink",
      )}
    >
      <item.icon className="h-[18px] w-[18px]" />
      {item.label}
    </Link>
  );
}

function BottomLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition active:scale-95",
        isActive ? "text-primary" : "text-muted",
      )}
    >
      <item.icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}
