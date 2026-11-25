"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Badge, Button, Card, SectionTitle, Textarea } from "@/components/ui";
import { Spinner } from "@/components/ui/client";
import { dateLabel, money, num } from "@/lib/format";
import { CLASS_LABEL, TX_LABEL } from "@/lib/portfolio/constants";
import type { CsvPreview } from "@/lib/portfolio/csv";
import { importCsvAction, previewCsvAction } from "../actions";

const SAMPLE = `date,type,symbol,quantity,price,fee,currency
2023-03-12,buy,VWCE.DE,10,98.5,1,EUR
2024-01-05,buy,BTC,0.05,950000,0,CZK
2024-06-20,dividend,AAPL,,12.4,1.86,USD`;

export function ImportClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const runPreview = (value = text) =>
    start(async () => {
      setErr(null);
      setResult(null);
      const res = await previewCsvAction(value);
      if (!res.ok) return setErr(res.error);
      setPreview(res.data!);
    });

  const runImport = () =>
    start(async () => {
      const res = await importCsvAction(text);
      if (!res.ok) return setErr(res.error);
      const d = res.data!;
      setResult(`Importováno ${d.transactionsCreated} transakcí, nových aktiv ${d.assetsCreated}.${d.errors.length ? ` Chyby: ${d.errors.length}` : ""}`);
      setPreview(null);
      setText("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm text-muted">
          Sloupce: <span className="font-mono text-xs text-fg-soft">date,type,symbol,quantity,price,fee,currency</span>. Typy: buy, sell, dividend, fee, withdrawal, valuation (i česky).
          U dividend dej částku do sloupce price. Oddělovač čárka, středník nebo tabulátor.
        </p>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          placeholder={SAMPLE}
          className="min-h-48 font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const value = await f.text();
              setText(value);
              runPreview(value);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={pending}>
            <Upload size={16} /> Nahrát soubor
          </Button>
          <Button variant="outline" onClick={() => runPreview()} disabled={pending || !text.trim()}>
            {pending && !preview && <Spinner />} Náhled
          </Button>
        </div>
        {err && <p className="text-sm text-neg">{err}</p>}
        {result && <p className="text-sm">{result}</p>}
      </Card>

      {preview && (
        <>
          <SectionTitle>Aktiva</SectionTitle>
          <Card className="py-1">
            {preview.assets.length === 0 && <p className="py-3 text-sm text-muted">Žádná platná data.</p>}
            {preview.assets.map((a) => (
              <div key={a.symbol} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {a.name} <span className="text-subtle">{a.symbol}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {CLASS_LABEL[a.class]} · {a.currency} · {a.priceSource === "manual" ? "ruční cena" : a.priceSource === "yahoo" ? "Yahoo" : "CoinGecko"} · {a.rows} řádků
                  </div>
                </div>
                <Badge tone={a.status === "existing" ? "default" : "solid"}>{a.status === "existing" ? "existuje" : "nové"}</Badge>
              </div>
            ))}
          </Card>

          {preview.errors.length > 0 && (
            <Card className="space-y-1 text-sm text-neg">
              {preview.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </Card>
          )}

          <SectionTitle>Transakce ({preview.rows.length})</SectionTitle>
          <Card className="max-h-96 overflow-y-auto py-1">
            {preview.rows.slice(0, 200).map((r) => (
              <div key={r.line} className="num flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
                <span className="w-24 shrink-0 text-muted">{dateLabel(r.date, { day: "numeric", month: "numeric", year: "numeric" })}</span>
                <span className="w-20 shrink-0">{TX_LABEL[r.type]}</span>
                <span className="flex-1 truncate">{r.symbol}</span>
                <span className="shrink-0 text-right text-fg-soft">
                  {r.type === "buy" || r.type === "sell"
                    ? `${num(r.quantity, 8)} × ${num(r.price, 4)}`
                    : money(r.amount, r.currency ?? preview.assets.find((a) => a.symbol === r.symbol)?.currency ?? "CZK", { decimals: 2 })}
                </span>
              </div>
            ))}
          </Card>
          <div className="flex justify-end">
            <Button onClick={runImport} disabled={pending || !preview.rows.length}>
              {pending && <Spinner />} Importovat {preview.rows.length} transakcí
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
