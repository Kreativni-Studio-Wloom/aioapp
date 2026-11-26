import { LegalLinks } from "@/components/legal-links";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="text-5xl font-bold tracking-tighter">AIO</div>
          <div className="mt-2 text-sm text-muted">Trénink · Výživa · Příjmy · Portfolio</div>
        </div>
        {children}
      </div>
      <LegalLinks className="mt-12" />
    </div>
  );
}
