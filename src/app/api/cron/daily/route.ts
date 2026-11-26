/**
 * Daily job (Vercel Cron, see vercel.json). Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * - ČNB FX fixing, asset prices, net-worth snapshots, recurring income
 * - push: stagnation + portfolio rebalance alerts (Mondays); Sunday weekly review
 * Time budget: price refresh stops starting new fetches after PRICE_BUDGET_MS and is abandoned at
 * PRICE_HARD_STOP_MS, so per-user steps (net-worth snapshots…) always get to run.
 */
import { db, t } from "@/db";
import { fxRate } from "@/lib/fx";
import { isoDate, money } from "@/lib/format";
import { sendPush } from "@/lib/push";
import { getPortfolioOverview, refreshPrices, snapshotNetWorth } from "@/lib/portfolio/service";
import { generateRecurring } from "@/lib/income/service";
import { getStagnation } from "@/lib/workout/service";
import { getIncomeSummary } from "@/lib/income/summary";
import { getWorkoutSummary } from "@/lib/workout/summary";

export const maxDuration = 300;

const PRICE_BUDGET_MS = 200_000;
const PRICE_HARD_STOP_MS = 230_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label}: timeout ${ms / 1000}s`)), ms))]);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const started = Date.now();
  const log: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      log.push(`${name}: ok${r !== undefined ? ` ${JSON.stringify(r).slice(0, 200)}` : ""}`);
    } catch (e) {
      log.push(`${name}: ERROR ${e instanceof Error ? e.message : e}`);
    }
  };

  await step("fx", () => fxRate("EUR", isoDate()));
  // per-fetch timeouts live in providers.ts; the deadline stops new fetches, the hard stop abandons the step
  await step("prices", () => withTimeout(refreshPrices(undefined, { deadline: started + PRICE_BUDGET_MS }), PRICE_HARD_STOP_MS - (Date.now() - started), "prices"));

  const users = await db.select({ id: t.users.id }).from(t.users);
  const weekday = new Date().toLocaleDateString("en-US", { timeZone: "Europe/Prague", weekday: "short" });
  const sunday = weekday === "Sun";
  const monday = weekday === "Mon";

  for (const u of users) {
    await step(`recurring ${u.id}`, () => generateRecurring(u.id));
    await step(`networth ${u.id}`, () => snapshotNetWorth(u.id));
    await step(`stagnation ${u.id}`, async () => {
      const s = (await getStagnation(u.id)) as unknown as { exerciseName?: string }[];
      if (Array.isArray(s) && s.length && new Date().getDay() === 1) {
        await sendPush(u.id, {
          title: "Stagnace v tréninku",
          body: `${s.map((x) => x.exerciseName).filter(Boolean).slice(0, 3).join(", ")} – podívej se na návrhy.`,
          url: "/workout",
          tag: "stagnation",
        });
      }
    });
    if (monday) {
      // at most weekly; only when the user has set target allocations
      await step(`rebalance ${u.id}`, async () => {
        const o = await getPortfolioOverview(u.id);
        const off = o.rebalance.filter((r) => r.needsAction);
        // unknown FX → weights are wrong; don't nag on bad data
        if (!o.rebalance.length || !off.length || o.fxMissing.length) return 0;
        return sendPush(u.id, {
          title: "Portfolio: čas na rebalanc",
          body: off
            .slice(0, 3)
            .map((r) => `${r.name} ${r.driftPp > 0 ? "+" : "−"}${Math.abs(r.driftPp).toFixed(1).replace(".", ",")} p. b.`)
            .join(", ") + " od cíle.",
          url: "/portfolio",
          tag: "rebalance",
        });
      });
    }
    if (sunday) {
      await step(`weekly ${u.id}`, async () => {
        const [w, i] = await Promise.all([getWorkoutSummary(u.id), getIncomeSummary(u.id)]);
        await sendPush(u.id, {
          title: "Týdenní přehled",
          body: `${w.weekWorkouts}× trénink · příjem tento měsíc ${money(i.monthNet)}`,
          url: "/",
          tag: "weekly",
        });
      });
    }
  }

  return Response.json({ ok: true, log });
}
