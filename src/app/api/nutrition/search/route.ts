import { NextResponse, type NextRequest } from "next/server";
import { userFromRequest } from "@/lib/auth";
import { searchFoods, searchLocalFoods, searchOffFoods } from "@/lib/nutrition/service";

/**
 * GET /api/nutrition/search?q=…&scope=local|off|all
 * Separate scopes let the UI show local results instantly while Open Food Facts loads.
 */
export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const scope = req.nextUrl.searchParams.get("scope") ?? "all";
  const hits =
    scope === "local" ? await searchLocalFoods(user.id, q) : scope === "off" ? await searchOffFoods(user.id, q) : await searchFoods(user.id, q);
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "private, no-store" } });
}
