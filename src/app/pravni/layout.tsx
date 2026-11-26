import Link from "next/link";
import { LegalLinks } from "@/components/legal-links";

export default function LegalLayout({ children }: LayoutProps<"/pravni">) {
  return (
    <div className="pt-safe pb-safe mx-auto min-h-dvh w-full max-w-3xl px-5 md:px-8">
      <header className="flex h-14 items-center justify-between">
        <Link href="/" className="text-base font-bold tracking-tight">
          AIO
        </Link>
        <Link href="/" className="text-sm text-muted hover:text-fg">
          Zpět do aplikace
        </Link>
      </header>
      <main className="py-6 md:py-10">{children}</main>
      <footer className="border-t border-line py-6">
        <LegalLinks />
      </footer>
    </div>
  );
}
