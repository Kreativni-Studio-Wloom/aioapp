"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Home, Dumbbell, Apple, Wallet, LineChart, Sparkles, Settings, Target, Search, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette, OPEN_PALETTE_EVENT, setPrivacy, usePrivacy } from "@/components/command-palette";

export const NAV: { href: string; label: string; icon: LucideIcon; mobile: boolean }[] = [
  { href: "/", label: "Domů", icon: Home, mobile: true },
  { href: "/workout", label: "Trénink", icon: Dumbbell, mobile: true },
  { href: "/nutrition", label: "Výživa", icon: Apple, mobile: true },
  { href: "/income", label: "Příjmy", icon: Wallet, mobile: true },
  { href: "/portfolio", label: "Portfolio", icon: LineChart, mobile: true },
  { href: "/goals", label: "Cíle", icon: Target, mobile: false },
  { href: "/ai", label: "AI asistent", icon: Sparkles, mobile: false },
  { href: "/settings", label: "Nastavení", icon: Settings, mobile: false },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));

function PrivacyButton({ className }: { className?: string }) {
  const hidden = usePrivacy();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={() => setPrivacy(!hidden)}
      className={className}
      aria-label={hidden ? "Zobrazit částky" : "Skrýt částky"}
      title={hidden ? "Zobrazit částky" : "Skrýt částky"}
      aria-pressed={hidden}
    >
      <Icon className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />
    </button>
  );
}

export function AppShell({ children, userLabel }: { children: React.ReactNode; userLabel: string }) {
  const pathname = usePathname();
  const hideMobileNav = /^\/workout\/session\//.test(pathname);
  const privateRoute = /^\/(income|portfolio)(\/|$)/.test(pathname);

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-3 py-6 md:flex">
        <Link href="/" className="mb-8 px-3 text-lg font-bold tracking-tight">
          AIO
        </Link>
        <button
          type="button"
          onClick={openPalette}
          className="mb-4 flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm text-muted transition-colors hover:text-fg"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
          <span className="flex-1 text-left">Hledat</span>
          <kbd className="text-[10px] text-subtle">⌘K</kbd>
        </button>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {active && (
                  <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-xl bg-card" transition={{ type: "spring", damping: 32, stiffness: 400 }} />
                )}
                <item.icon className="relative h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
                <span className="relative font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 px-3">
          <span className="truncate text-xs text-subtle">{userLabel}</span>
          <PrivacyButton className="rounded-lg p-1.5 text-muted hover:text-fg" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="pt-safe sticky top-0 z-30 flex items-center justify-between bg-bg/80 px-4 backdrop-blur-xl md:hidden">
        <div className="flex h-12 items-center">
          <Link href="/" className="text-base font-bold tracking-tight">
            AIO
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={openPalette} className="rounded-full p-2 text-muted" aria-label="Hledat">
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <PrivacyButton className="rounded-full p-2 text-muted" />
          <Link href="/goals" className={cn("rounded-full p-2", isActive(pathname, "/goals") ? "text-fg" : "text-muted")} aria-label="Cíle">
            <Target className="h-5 w-5" strokeWidth={1.75} />
          </Link>
          <Link href="/ai" className={cn("rounded-full p-2", isActive(pathname, "/ai") ? "text-fg" : "text-muted")} aria-label="AI asistent">
            <Sparkles className="h-5 w-5" strokeWidth={1.75} />
          </Link>
          <Link href="/settings" className={cn("rounded-full p-2", isActive(pathname, "/settings") ? "text-fg" : "text-muted")} aria-label="Nastavení">
            <Settings className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </div>
      </div>

      <main data-private={privateRoute || undefined} className={cn("mx-auto w-full max-w-5xl flex-1 px-4 pt-4 md:px-10 md:pt-10 md:pb-16", hideMobileNav ? "pb-safe" : "pb-nav")}>{children}</main>

      {/* Mobile bottom tab bar */}
      {!hideMobileNav && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
            {NAV.filter((n) => n.mobile).map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} className="relative flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2.5">
                  {active && <motion.span layoutId="tab-active" className="absolute top-0 h-0.5 w-8 rounded-full bg-fg" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
                  <item.icon className={cn("h-[22px] w-[22px] transition-colors", active ? "text-fg" : "text-subtle")} strokeWidth={active ? 2.25 : 1.75} />
                  <span className={cn("text-[10px] font-medium transition-colors", active ? "text-fg" : "text-subtle")}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <CommandPalette />
    </div>
  );
}
