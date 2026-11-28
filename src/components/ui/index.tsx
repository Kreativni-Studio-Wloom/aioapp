import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ── Button ─────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none transition-[background,color,transform,opacity] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg whitespace-nowrap";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-fg text-inverse hover:opacity-90",
  secondary: "bg-card text-fg hover:bg-card-hover",
  outline: "border border-line-strong text-fg hover:bg-card",
  ghost: "text-fg-soft hover:text-fg hover:bg-card",
  danger: "bg-card text-neg hover:bg-card-hover",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-11 px-4 text-[15px] md:h-10 md:text-sm",
  lg: "h-14 px-6 text-base",
  icon: "h-10 w-10",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }>(
  function Button({ variant = "primary", size = "md", className, type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
  },
);

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ── Form controls ──────────────────────────────────────── */

const fieldBase =
  "w-full rounded-xl bg-bg-elev border border-line px-3.5 text-fg placeholder:text-subtle outline-none transition-colors focus:border-fg/40 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-11 md:h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "py-2.5 min-h-24 resize-y", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, "h-11 md:h-10 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
});

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
      {children}
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </label>
  );
}

/* ── Layout primitives ──────────────────────────────────── */

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-2xl bg-card p-4 md:p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "block rounded-2xl bg-card p-4 md:p-5 transition-[background,transform] duration-200 hover:bg-card-hover active:scale-[0.985]",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: string }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Zpět
          </Link>
        )}
        <h1 className="truncate text-[28px] font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 mt-8 flex items-center justify-between first:mt-0", className)}>
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, className, size = "md" }: { label: string; value: ReactNode; sub?: ReactNode; className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("num mt-1 truncate font-semibold tracking-tight", size === "lg" ? "text-4xl" : "text-xl")}>{value}</div>
      {sub && <div className="num mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({ children, className, tone = "default" }: { children: ReactNode; className?: string; tone?: "default" | "solid" | "pos" | "neg" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "default" && "bg-bg-elev text-fg-soft border border-line",
        tone === "solid" && "bg-fg text-inverse",
        tone === "pos" && "text-pos border border-line",
        tone === "neg" && "text-neg border border-line",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Delta({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <span className={cn("num", value > 0 && "text-pos", value < 0 && "text-neg", value === 0 && "text-muted", className)}>
      {sign}
      {Math.abs(value).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })}
      {suffix}
    </span>
  );
}

export function Row({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-line py-3 last:border-0", className)} {...props}>
      {children}
    </div>
  );
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div className="h-full rounded-full bg-fg transition-[width] duration-700 ease-[var(--ease-spring)]" style={{ width: `${p}%` }} />
    </div>
  );
}
