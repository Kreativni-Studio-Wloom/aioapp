/**
 * Minimal OAuth 2.1 authorization server for the MCP endpoint (so the Claude app can add AIO
 * as a custom connector): dynamic client registration, authorization code + PKCE (S256),
 * refresh tokens with rotation. Access tokens are rows in `api_keys` (revocable in Settings).
 */
import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, t } from "@/db";
import { sha256 } from "@/lib/auth";

export const ACCESS_TTL_S = 60 * 60 * 24 * 30; // 30 days
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 365;
const CODE_TTL_MS = 1000 * 60 * 10;

export function baseUrl(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}

export function authServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["aio"],
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["aio"],
    resource_name: "AIO",
  };
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
};

function isAllowedRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    // native / local clients (Claude Desktop, Claude Code, MCP inspector)
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(uri); // custom app scheme
  }
}

export async function registerClient(body: { client_name?: string; redirect_uris?: unknown }) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || !uris.every(isAllowedRedirect)) throw new Error("invalid_redirect_uri");
  const id = `aioc_${randomBytes(16).toString("base64url")}`;
  const name = (body.client_name || "MCP klient").slice(0, 100);
  await db.insert(t.oauthClients).values({ id, name, redirectUris: uris });
  return { client_id: id, client_name: name, redirect_uris: uris };
}

export async function getClient(id: string) {
  const [c] = await db.select().from(t.oauthClients).where(eq(t.oauthClients.id, id));
  return c ?? null;
}

export async function createCode(p: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; scope?: string | null }) {
  const code = randomBytes(32).toString("base64url");
  await db.insert(t.oauthCodes).values({
    codeHash: sha256(code),
    clientId: p.clientId,
    userId: p.userId,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    scope: p.scope ?? null,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

async function issueTokens(userId: string, clientId: string, clientName: string) {
  const access = `aio_${randomBytes(32).toString("base64url")}`;
  const refresh = `aior_${randomBytes(32).toString("base64url")}`;
  await db.insert(t.apiKeys).values({
    userId,
    name: clientName,
    keyHash: sha256(access),
    prefix: access.slice(0, 10),
    clientId,
    expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
    refreshHash: sha256(refresh),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "aio" };
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
}

export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; verifier: string }) {
  const [row] = await db.delete(t.oauthCodes).where(eq(t.oauthCodes.codeHash, sha256(p.code))).returning();
  if (!row || row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Code is invalid or expired");
  if (row.clientId !== p.clientId) throw new OAuthError("invalid_grant", "Client mismatch");
  if (p.redirectUri && row.redirectUri !== p.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
  const challenge = createHash("sha256").update(p.verifier).digest("base64url");
  if (challenge !== row.codeChallenge) throw new OAuthError("invalid_grant", "PKCE verification failed");
  const client = await getClient(row.clientId);
  return issueTokens(row.userId, row.clientId, client?.name ?? "MCP klient");
}

export async function refreshTokens(p: { refreshToken: string; clientId?: string | null }) {
  const [row] = await db
    .select()
    .from(t.apiKeys)
    .where(and(eq(t.apiKeys.refreshHash, sha256(p.refreshToken)), gt(t.apiKeys.refreshExpiresAt, new Date())));
  if (!row || !row.clientId) throw new OAuthError("invalid_grant", "Refresh token is invalid or expired");
  if (p.clientId && p.clientId !== row.clientId) throw new OAuthError("invalid_grant", "Client mismatch");
  await db.delete(t.apiKeys).where(eq(t.apiKeys.id, row.id)); // rotation
  return issueTokens(row.userId, row.clientId, row.name);
}

export async function revokeToken(token: string) {
  const h = sha256(token);
  await db.delete(t.apiKeys).where(eq(t.apiKeys.keyHash, h));
  await db.delete(t.apiKeys).where(eq(t.apiKeys.refreshHash, h));
}
