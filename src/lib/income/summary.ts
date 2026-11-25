import { isoDate } from "@/lib/format";
import { addMonths, monthEnd, avgMonthlyNet12m, sumTransactions } from "./service";

export type IncomeSummary = {
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  lastMonthNet: number;
  yearIncome: number;
  yearNet: number;
  avgMonthlyNet12m: number;
};

/** Dashboard summary – all values in CZK. */
export async function getIncomeSummary(userId: string): Promise<IncomeSummary> {
  const today = isoDate();
  const ym = today.slice(0, 7);
  const prevYm = addMonths(ym, -1);
  const [month, lastMonth, year, avg12] = await Promise.all([
    sumTransactions(userId, { from: `${ym}-01`, to: monthEnd(ym) }),
    sumTransactions(userId, { from: `${prevYm}-01`, to: monthEnd(prevYm) }),
    sumTransactions(userId, { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }),
    avgMonthlyNet12m(userId),
  ]);
  return {
    monthIncome: month.income,
    monthExpense: month.expense,
    monthNet: month.net,
    lastMonthNet: lastMonth.net,
    yearIncome: year.income,
    yearNet: year.net,
    avgMonthlyNet12m: avg12,
  };
}
