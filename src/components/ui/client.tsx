"use client";

import { AnimatePresence, motion, useSpring, useTransform, useMotionValueEvent } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Button } from "./index";
import { cn, isPrivateRoute } from "@/lib/utils";

/* ── Sheet: bottom sheet on mobile, centered dialog on desktop ── */

export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // the sheet is portalled to <body>, outside <main data-private>, so it carries the privacy scope itself
  const privateScope = isPrivateRoute(usePathname());
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div data-private={privateScope || undefined} className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-bg-elev md:max-w-lg md:rounded-3xl",
              className,
            )}
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 32, stiffness: 380 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragListener={false}
          >
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-line-strong md:hidden absolute left-1/2 top-2 -translate-x-1/2" />
              <div className="pt-3 text-lg font-semibold tracking-tight">{title}</div>
              <button onClick={onClose} className="mt-3 rounded-full p-1.5 text-muted hover:bg-card hover:text-fg" aria-label="Zavřít">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ── Segmented control ── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  layoutId = "seg",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  layoutId?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-xl bg-card p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "text-inverse" : "text-muted hover:text-fg",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-fg" transition={{ type: "spring", damping: 30, stiffness: 400 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Animated number (counts to value) ── */

const PRESETS = {
  int: (n: number) => Math.round(n).toLocaleString("cs-CZ"),
  money: (n: number) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(n),
  decimal1: (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

/**
 * Animated count-up. From server components pass `preset` (functions can't cross the server/client boundary);
 * from client components `format` works too.
 */
export function AnimatedNumber({
  value,
  preset = "int",
  format: formatFn,
  className,
}: {
  value: number;
  preset?: keyof typeof PRESETS;
  format?: (n: number) => string;
  className?: string;
}) {
  const format = formatFn ?? PRESETS[preset];
  const spring = useSpring(value, { damping: 30, stiffness: 120 });
  const display = useTransform(spring, (v) => format(v));
  const [text, setText] = useState(() => format(value));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      spring.jump(0);
    }
    spring.set(value);
  }, [value, spring]);
  useMotionValueEvent(display, "change", (v) => setText(v));
  return <span className={cn("num", className)}>{text}</span>;
}

/* ── Submit button with pending state ── */

export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (
        <>
          <Spinner /> {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ── Ring (macro / progress) ── */

export function Ring({ value, max, size = 120, stroke = 10, children }: { value: number; max: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--fg)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ type: "spring", damping: 30, stiffness: 80 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ── Confirm button (two-tap destructive) ── */

export function ConfirmButton({ onConfirm, children, confirmText = "Opravdu?", ...props }: ComponentProps<typeof Button> & { onConfirm: () => void; confirmText?: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <Button
      variant="danger"
      {...props}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmText : children}
    </Button>
  );
}
