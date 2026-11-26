import Link from "next/link";
import { cn } from "@/lib/utils";

export const LEGAL_LINKS = [
  { href: "/pravni/podminky", label: "Podmínky užívání" },
  { href: "/pravni/soukromi", label: "Ochrana osobních údajů" },
  { href: "/pravni/cookies", label: "Cookies" },
  { href: "mailto:grigar.adam@gmail.com", label: "Kontakt" },
];

/** Footer links to the legal documents (auth pages, legal pages, settings, sidebar). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Právní informace" className={cn("flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted", className)}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-fg">
          {l.label}
        </Link>
      ))}
      <span className="text-subtle">© {new Date().getFullYear()} Adam Grigar</span>
    </nav>
  );
}
