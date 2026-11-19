import { cn } from "@/lib/utils";

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6279F5" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path
        d="M41 22.5c-2-2.2-5-3.5-8.6-3.5-5.6 0-9.4 2.9-9.4 7.2 0 9.6 18 5.2 18 13.3 0 3.4-3.2 5.5-8 5.5-4 0-7.3-1.4-9.6-4"
        fill="none"
        stroke="#F0F2F5"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="46" cy="16" r="3.2" fill="#D8C7A5" />
    </svg>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {showText && <span className="font-display text-lg font-extrabold tracking-[0.18em] text-ink">STUDIORA</span>}
    </div>
  );
}
