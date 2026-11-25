/** Pure position math (no DB, no network) – unit-testable and client-safe. */
import { addDays } from "@/lib/format";
import type { AssetTxType } from "./constants";

export type TxLike = {
  type: AssetTxType;
  date: string;
  quantity: number;
  price: number;
  fee: number;
  amount: number;
  createdAt?: Date | string | null;
};

export type PositionStats = {
  /** units held (0 for manual assets) */
  quantity: number;
  /** weighted average cost per unit incl. fees (asset currency) */
  avgCost: number;
  /** cost basis of what is currently held (asset currency) */
  invested: number;
  /** current value (asset currency) */
  value: number;
  unrealized: number;
  unrealizedPct: number;
  /** realized P/L from sells minus standalone fees */
  realized: number;
  dividends: number;
  withdrawn: number;
  fees: number;
  lastValuationDate: string | null;
};

export type Lot = {
  date: string;
  quantity: number;
  price: number;
  /** first day the Czech 3-year time test is met */
  timeTestDate: string;
  timeTestMet: boolean;
};

export function sortTx<T extends TxLike>(txs: T[]): T[] {
  return [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ca - cb;
  });
}

/** Gross amount of a buy/sell: explicit amount, else quantity × price. */
const gross = (tx: TxLike) => (tx.amount ? tx.amount : tx.quantity * tx.price);

export function computePosition(txs: TxLike[], opts: { manual: boolean; lastPrice: number | null }): PositionStats {
  return opts.manual ? computeManual(txs) : computeMarket(txs, opts.lastPrice);
}

function computeMarket(txs: TxLike[], lastPrice: number | null): PositionStats {
  let qty = 0;
  let cost = 0;
  let realized = 0;
  let dividends = 0;
  let withdrawn = 0;
  let fees = 0;
  for (const tx of sortTx(txs)) {
    switch (tx.type) {
      case "buy":
        qty += tx.quantity;
        cost += tx.quantity * tx.price + tx.fee;
        fees += tx.fee;
        break;
      case "sell": {
        const sold = Math.min(tx.quantity, qty);
        const avg = qty > 0 ? cost / qty : 0;
        realized += tx.quantity * tx.price - tx.fee - avg * sold;
        cost -= avg * sold;
        qty -= sold;
        fees += tx.fee;
        if (qty < 1e-12) {
          qty = 0;
          cost = 0;
        }
        break;
      }
      case "dividend":
        dividends += tx.amount - tx.fee;
        break;
      case "withdrawal":
        withdrawn += tx.amount;
        break;
      case "fee": {
        const f = tx.amount || tx.fee;
        fees += f;
        realized -= f;
        break;
      }
      case "valuation":
        break;
    }
  }
  const value = lastPrice != null ? qty * lastPrice : cost;
  const unrealized = value - cost;
  return {
    quantity: qty,
    avgCost: qty > 0 ? cost / qty : 0,
    invested: cost,
    value,
    unrealized,
    unrealizedPct: cost > 0 ? (unrealized / cost) * 100 : 0,
    realized,
    dividends,
    withdrawn,
    fees,
    lastValuationDate: null,
  };
}

/**
 * Manually valued assets (cash, real estate…): buy = deposit, sell = capital withdrawal,
 * valuation = sets the current total value, withdrawal = profit taken out (reduces value).
 */
function computeManual(txs: TxLike[]): PositionStats {
  let value = 0;
  let invested = 0;
  let realized = 0;
  let dividends = 0;
  let withdrawn = 0;
  let fees = 0;
  let lastValuationDate: string | null = null;
  for (const tx of sortTx(txs)) {
    switch (tx.type) {
      case "buy": {
        const amt = gross(tx);
        value += amt;
        invested += amt + tx.fee;
        fees += tx.fee;
        break;
      }
      case "sell": {
        const amt = gross(tx);
        if (value > 0) {
          const frac = Math.min(1, amt / value);
          realized += amt - tx.fee - invested * frac;
          invested -= invested * frac;
        } else realized += amt - tx.fee;
        value = Math.max(0, value - amt);
        fees += tx.fee;
        break;
      }
      case "valuation":
        value = tx.amount;
        lastValuationDate = tx.date;
        break;
      case "withdrawal":
        withdrawn += tx.amount;
        value = Math.max(0, value - tx.amount);
        break;
      case "dividend":
        dividends += tx.amount - tx.fee;
        break;
      case "fee": {
        const f = tx.amount || tx.fee;
        fees += f;
        realized -= f;
        break;
      }
    }
  }
  const unrealized = invested > 0 ? value - invested : 0;
  return {
    quantity: 0,
    avgCost: 0,
    invested,
    value,
    unrealized,
    unrealizedPct: invested > 0 ? (unrealized / invested) * 100 : 0,
    realized,
    dividends,
    withdrawn,
    fees,
    lastValuationDate,
  };
}

/** Running value of a manual asset per transaction date (for its chart). */
export function manualValueSeries(txs: TxLike[]): { date: string; price: number }[] {
  const out = new Map<string, number>();
  const sorted = sortTx(txs);
  for (let i = 0; i < sorted.length; i++) {
    out.set(sorted[i].date, computeManual(sorted.slice(0, i + 1)).value);
  }
  return [...out].map(([date, price]) => ({ date, price }));
}

/** Add whole years to an ISO date (29 Feb → 28 Feb in non-leap years). */
function addYears(iso: string, years: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** Open FIFO lots with the Czech 3-year time test (held more than 3 years → exempt). */
export function fifoLots(txs: TxLike[], today: string): Lot[] {
  const lots: { date: string; quantity: number; price: number }[] = [];
  for (const tx of sortTx(txs)) {
    if (tx.type === "buy" && tx.quantity > 0) {
      lots.push({ date: tx.date, quantity: tx.quantity, price: tx.quantity ? (tx.quantity * tx.price + tx.fee) / tx.quantity : tx.price });
    } else if (tx.type === "sell") {
      let left = tx.quantity;
      while (left > 1e-12 && lots.length) {
        const take = Math.min(left, lots[0].quantity);
        lots[0].quantity -= take;
        left -= take;
        if (lots[0].quantity <= 1e-12) lots.shift();
      }
    }
  }
  return lots.map((l) => {
    const timeTestDate = addDays(addYears(l.date, 3), 1);
    return { ...l, timeTestDate, timeTestMet: timeTestDate <= today };
  });
}
