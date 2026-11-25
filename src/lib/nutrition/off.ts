/** Open Food Facts client (server-side only). Values normalised to per 100 g. */

const UA = "AIO-app/1.0 (personal nutrition tracker)";
const FIELDS = "code,product_name,product_name_cs,product_name_en,generic_name,brands,nutriments,serving_quantity";

export type OffProduct = {
  ean: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  salt: number | null;
  servingG: number | null;
};

type RawProduct = {
  code?: string;
  product_name?: string;
  product_name_cs?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string | string[];
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function normalizeOff(p: RawProduct): OffProduct | null {
  const nu = p.nutriments ?? {};
  let kcal = n(nu["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = n(nu["energy-kj_100g"]) ?? n(nu["energy_100g"]);
    if (kj != null) kcal = kj / 4.184;
  }
  const name = (p.product_name_cs || p.product_name || p.product_name_en || p.generic_name || "").trim();
  if (!p.code || !name || kcal == null) return null;
  const brandsRaw = Array.isArray(p.brands) ? p.brands : (p.brands ?? "").split(",");
  const brand =
    brandsRaw
      .map((b) => b.replace(/^[a-z]{2}:/, "").trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(", ") || null;
  const serving = n(p.serving_quantity);
  return {
    ean: String(p.code),
    name,
    brand,
    kcal: Math.round(kcal),
    protein: r1(n(nu["proteins_100g"]) ?? 0),
    carbs: r1(n(nu["carbohydrates_100g"]) ?? 0),
    fat: r1(n(nu["fat_100g"]) ?? 0),
    fiber: n(nu["fiber_100g"]) != null ? r1(n(nu["fiber_100g"])!) : null,
    sugar: n(nu["sugars_100g"]) != null ? r1(n(nu["sugars_100g"])!) : null,
    salt: n(nu["salt_100g"]) != null ? Math.round(n(nu["salt_100g"])! * 100) / 100 : null,
    servingG: serving && serving > 0 && serving < 5000 ? serving : null,
  };
}

async function getJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Full-text search. Uses the Search-a-licious API (fast) and falls back to the
 * classic cgi/search.pl endpoint. Never throws – returns [] on failure.
 */
export async function offSearch(q: string, limit = 20): Promise<OffProduct[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const sal = (await getJson(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=${limit}&langs=cs,en&fields=${FIELDS}`,
    6000,
  )) as { hits?: RawProduct[] } | null;
  let raw: RawProduct[] | undefined = sal?.hits;

  if (!raw || raw.length === 0) {
    const cgi = (await getJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&lc=cs&fields=${FIELDS}`,
      8000,
    )) as { products?: RawProduct[] } | null;
    raw = cgi?.products;
  }
  const out: OffProduct[] = [];
  const seen = new Set<string>();
  for (const p of raw ?? []) {
    const np = normalizeOff(p);
    if (np && !seen.has(np.ean)) {
      seen.add(np.ean);
      out.push(np);
    }
  }
  return out;
}

/** Product by barcode, or null when unknown / offline. */
export async function offProduct(ean: string): Promise<OffProduct | null> {
  const code = ean.replace(/\D/g, "");
  if (!code) return null;
  const data = (await getJson(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, 8000)) as {
    status?: number;
    product?: RawProduct;
  } | null;
  if (!data || data.status !== 1 || !data.product) return null;
  return normalizeOff({ ...data.product, code: data.product.code || code });
}
