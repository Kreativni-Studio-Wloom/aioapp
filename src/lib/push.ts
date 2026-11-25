import * as webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@aioapp.eu", pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Send a push to all of a user's subscribed devices. Returns how many were delivered. */
export async function sendPush(userId: string, payload: PushPayload) {
  if (!configure()) return 0;
  const subs = await db.select().from(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, userId));
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.id, s.id));
        else console.error("push failed", code);
      }
    }),
  );
  return sent;
}
