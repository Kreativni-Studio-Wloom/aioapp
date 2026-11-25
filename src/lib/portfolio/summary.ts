import { getPortfolioOverview } from "./service";

export type PortfolioSummary = {
  totalCzk: number;
  dayChangeCzk: number;
  dayChangePct: number;
  investedCzk: number;
  unrealizedCzk: number;
  liabilitiesCzk: number;
  netWorthCzk: number;
  allocation: { class: string; valueCzk: number; pct: number }[];
};

/** Compact portfolio numbers for the home dashboard (CZK). */
export async function getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
  const o = await getPortfolioOverview(userId);
  return {
    totalCzk: o.totalCzk,
    dayChangeCzk: o.dayChangeCzk,
    dayChangePct: o.dayChangePct,
    investedCzk: o.investedCzk,
    unrealizedCzk: o.unrealizedCzk,
    liabilitiesCzk: o.liabilitiesCzk,
    netWorthCzk: o.netWorthCzk,
    allocation: o.allocation.map((a) => ({ class: a.class, valueCzk: a.valueCzk, pct: a.pct })),
  };
}
