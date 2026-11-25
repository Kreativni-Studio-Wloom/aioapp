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
