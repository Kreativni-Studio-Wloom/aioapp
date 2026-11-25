# AIO – conventions for contributors (humans and agents)

Read this before writing code. Read `AGENTS.md` too: this is **Next.js 16** (docs in `node_modules/next/dist/docs/`). Notable: `middleware` is now `src/proxy.ts`; `params`/`searchParams`/`cookies()` are async; `PageProps<"/route">` / `LayoutProps` are global typed helpers. `cacheComponents` is **off** (classic dynamic rendering; any page using `requireUser()` is dynamic).

## Stack
- Next.js App Router + TypeScript, Tailwind v4 (tokens in `src/app/globals.css`), `motion/react` for animation, `recharts` for charts, `lucide-react` icons, `zod` validation.
- DB: Postgres via Drizzle (`src/db/schema.ts`, client `import { db, t } from "@/db"`). Local DB is Homebrew Postgres (`DATABASE_URL` in `.env.local`). Apply schema changes with `npx drizzle-kit push --force`.
- Auth: `requireUser()` from `@/lib/auth` (server components + server actions). Returns `{ id, email, name }`. **Every query must filter by `userId`.**
- AI: `@/lib/ai` → `aiStructured({ system, content, schema })` for structured extraction (Claude, zod schema), `imageBlock(dataUrl)`, `aiEnabled()`. Throws `AiDisabledError` if no API key – catch it and show a friendly message.
- FX: `@/lib/fx` → `fxRate(currency, date)` / `toCzk(amount, currency, date)` (ČNB rates, cached in `fx_rates`). Base currency is CZK.
- Formatting: `@/lib/format` → `money`, `num`, `pct`, `isoDate` (Europe/Prague "YYYY-MM-DD"), `addDays`, `dateLabel`, `relativeDay`, `duration`, `MONTHS_CS`.
- Utils: `@/lib/utils` → `cn`, `toNum` (accepts "12,5"), `str`, `ActionResult`.

## Architecture per module (`workout`, `nutrition`, `income`, `portfolio`)
```
src/lib/<module>/service.ts   plain async functions (userId first arg) – all DB logic lives here.
                              Used by server actions, the REST API, the AI assistant and the dashboard.
src/lib/<module>/summary.ts   export async function get<Module>Summary(userId): Promise<…> for the home dashboard
src/app/(app)/<module>/…      pages (server components) + client components
src/app/(app)/<module>/actions.ts   "use server" thin wrappers: requireUser() → zod parse → service → revalidatePath
```
Keep services free of Next-specific imports (no `next/headers`, no `redirect`) so they can be reused anywhere.

## UI kit (use it, keep everything consistent)
- Server-safe: `@/components/ui` → `Button`, `LinkButton`, `buttonClass`, `Input`, `Textarea`, `Select`, `Field`, `Card`, `CardLink`, `PageHeader`, `SectionTitle`, `Stat`, `Empty`, `Badge`, `Delta`, `Row`, `ProgressBar`.
- Client: `@/components/ui/client` → `Sheet` (bottom sheet on mobile / dialog on desktop), `Segmented`, `AnimatedNumber`, `SubmitButton`, `Spinner`, `Ring`, `ConfirmButton`.
- Colors: only tokens – `bg-bg`, `bg-bg-elev`, `bg-card`, `hover:bg-card-hover`, `border-line`, `border-line-strong`, `text-fg`, `text-fg-soft`, `text-muted`, `text-subtle`, `text-inverse`, `text-pos`, `text-neg`. Strictly monochrome; `pos/neg` only for +/- numbers. Charts: `var(--fg)` lines, `var(--line)` grid, `var(--muted)` axis text.
- Numbers: add class `num` (tabular figures).
- Layout: mobile-first. Touch targets ≥ 44px. Use `grid gap-3 md:grid-cols-2/3` for cards. Page starts with `<PageHeader>`. The shell already handles nav, safe areas and page fade-in.
- Forms: prefer `<form action={serverAction}>` + `SubmitButton`; for interactive flows use client components calling server actions and `useTransition`. Use `inputMode="decimal"` for numbers (Czech comma accepted via `toNum`).
- Animations: subtle (150–300 ms, spring), `motion` `layout` for list reorders, `AnimatePresence` for add/remove.
- Language of all UI copy: **Czech**. Code/comments: English.

## Rules
- No new npm dependencies unless essential (already installed: motion, recharts, @zxing/browser, zod, lucide-react, @anthropic-ai/sdk, web-push).
- Don't edit files owned by another module. Shared files (`schema.ts`, `components/ui/*`, `lib/*.ts`, `app-shell.tsx`) – only additive edits, and only if really needed.
- Don't run `next build` or start a dev server (one is already running on :3000 and auto-reloads). Verify with `npx tsc --noEmit` (ignore errors in files you don't own) and `npx eslint <your files>`.
- Testing data: you may query the local DB with `psql aioapp`. The dev account is `dev@aioapp.test`.
