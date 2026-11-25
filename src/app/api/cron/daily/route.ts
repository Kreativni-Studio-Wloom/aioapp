/**
 * Daily job (Vercel Cron, see vercel.json). Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * - ČNB FX fixing, asset prices, net-worth snapshots, recurring income
 * - push: stagnation alerts; Sunday weekly review
 */
import { db, t } from "@/db";
import { fxRate } from "@/lib/fx";
import { isoDate, money } from "@/lib/format";
import { sendPush } from "@/lib/push";
import { refreshPrices, snapshotNetWorth } from "@/lib/portfolio/service";
import { generateRecurring } from "@/lib/income/service";
import { getStagnation } from "@/lib/workout/service";
import { getIncomeSummary } from "@/lib/income/summary";
import { getWorkoutSummary } from "@/lib/workout/summary";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

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
  await step("prices", () => refreshPrices());

  const users = await db.select({ id: t.users.id }).from(t.users);
  const sunday = new Date().toLocaleDateString("en-US", { timeZone: "Europe/Prague", weekday: "short" }) === "Sun";

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
