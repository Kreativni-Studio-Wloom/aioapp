/** Clean an env value pasted with quotes, whitespace or a leading `NAME=` (common in hosting dashboards). */
function clean(name: string, raw: string | undefined) {
  if (!raw) return undefined;
  let v = raw.trim();
  if (v.startsWith(`${name}=`)) v = v.slice(name.length + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1).trim();
  return v || undefined;
}

export function databaseUrl() {
  return clean("DATABASE_URL", process.env.DATABASE_URL);
}

/** Public origin of the app (scheme + host only), or undefined when not configured. */
export function appOrigin() {
  const v = clean("APP_URL", process.env.APP_URL);
  if (!v) return undefined;
  try {
    return new URL(v.includes("://") ? v : `https://${v}`).origin;
  } catch {
    return undefined;
  }
}

/** Non-secret description of a postgres URL, for diagnostics. */
export function describeDbUrl(url: string | undefined) {
  if (!url) return { set: false };
  try {
    const u = new URL(url);
    return {
      set: true,
      protocol: u.protocol,
      host: u.hostname,
      port: u.port,
      user: decodeURIComponent(u.username),
      database: u.pathname.slice(1),
      passwordSet: !!u.password,
      passwordIsPlaceholder: /YOUR-PASSWORD/i.test(decodeURIComponent(u.password)),
    };
  } catch {
    return { set: true, parseable: false };
  }
}

function firstEnv(...names: string[]) {
  for (const n of names) {
    const v = clean(n, process.env[n]);
    if (v) return v;
  }
  return undefined;
}

/**
 * Supabase project URL. Explicit SUPABASE_URL wins; otherwise it is derived from a Supabase pooler
 * DATABASE_URL (user `postgres.<project-ref>`), so production needs only the publishable key.
 */
export function supabaseUrl() {
  const explicit = firstEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const d = describeDbUrl(databaseUrl());
  const ref = "user" in d ? d.user?.match(/^postgres\.([a-z0-9]+)$/)?.[1] : undefined;
  return ref ? `https://${ref}.supabase.co` : undefined;
}

/** Publishable (sb_publishable_…) or legacy anon key – both are safe to expose. */
export function supabaseKey() {
  return firstEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}
