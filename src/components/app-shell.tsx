"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Home, Dumbbell, Apple, Wallet, LineChart, Sparkles, Settings, Target, Search, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette, OPEN_PALETTE_EVENT, setPrivacy, usePrivacy } from "@/components/command-palette";
import { TabBar } from "@/components/tab-bar";

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

const TOP_LINKS = [
  { href: "/goals", label: "Cíle", icon: Target },
  { href: "/ai", label: "AI asistent", icon: Sparkles },
  { href: "/settings", label: "Nastavení", icon: Settings },
];

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

      {/* Mobile top bar: no background, controls float as Liquid Glass; content blurs out under the status bar */}
      <header className="pt-safe sticky top-0 z-30 md:hidden">
        <div aria-hidden className="scroll-edge" />
        <div className="relative flex h-14 items-center justify-between px-4">
          <Link href="/" className="text-[17px] font-semibold tracking-tight">
            AIO
          </Link>
          <div className="glass flex h-11 items-center rounded-full px-1">
            <PrivacyButton className="glass-icon-btn text-fg" />
            {TOP_LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-label={l.label} aria-current={isActive(pathname, l.href) ? "page" : undefined} className={cn("glass-icon-btn", isActive(pathname, l.href) ? "text-fg" : "text-fg-soft")}>
                <l.icon className="h-5 w-5" strokeWidth={isActive(pathname, l.href) ? 2.25 : 1.75} />
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main data-private={privateRoute || undefined} className={cn("mx-auto w-full max-w-5xl flex-1 px-4 pt-4 md:px-10 md:pt-10 md:pb-16", hideMobileNav ? "pb-safe" : "pb-nav")}>{children}</main>

      {/* Mobile floating Liquid Glass tab bar */}
      {!hideMobileNav && <TabBar pathname={pathname} items={NAV.filter((n) => n.mobile)} />}
      <CommandPalette />
    </div>
  );
}
