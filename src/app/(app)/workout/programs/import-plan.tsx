"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileUp, Sparkles, X } from "lucide-react";
import { Button, Card, Textarea } from "@/components/ui";
import { Spinner } from "@/components/ui/client";
import { cn } from "@/lib/utils";

const MAX_FILES = 10;
const MAX_BYTES = 4_000_000;
const ACCEPT =
  ".pdf,.csv,.tsv,.txt,.md,.json,.html,.rtf,.xlsx,.xlsm,.xlsb,.xls,.ods,.numbers,.docx,.odt,.pptx,.odp,image/*,application/pdf,text/*";

/** Photos are re-encoded to JPEG ≤ 2000 px: smaller upload and HEIC (iPhone) becomes readable. */
async function prepare(file: File): Promise<File> {
  const isImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
  if (!isImage || file.type === "image/gif") return file;
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1_500_000 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // browser can't decode it – let the server explain
  }
}

const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} kB`);

export function ImportPlan() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const add = async (list: FileList | File[] | null) => {
    if (!list?.length) return;
    setErr(null);
    const prepared = await Promise.all(Array.from(list).map(prepare));
    setFiles((prev) => {
      const next = [...prev, ...prepared].slice(0, MAX_FILES);
      if (prev.length + prepared.length > MAX_FILES) setErr(`Najednou jde nahrát nejvýš ${MAX_FILES} souborů.`);
      return next;
    });
  };

  const total = files.reduce((s, f) => s + f.size, 0);
  const tooBig = total > MAX_BYTES;

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      if (text.trim()) fd.append("text", text.trim());
      const res = await fetch("/api/workout/import", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error ?? (res.status === 413 ? "Soubory jsou moc velké (max 4 MB)." : "Plán se nepodařilo zpracovat."));
      router.push(`/workout/programs/${data.id}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Plán se nepodařilo zpracovat.");
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">
        Nahraj svůj stávající plán – PDF, Excel, CSV, Word, fotku papíru nebo screenshot. AI ho přečte, cviky spáruje s knihovnou a vytvoří program, který pak můžeš upravit.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => !busy && fileRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors",
          drag ? "border-fg bg-bg-elev" : "border-line-strong hover:bg-bg-elev",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <FileUp className="h-5 w-5 text-muted" />
        <div className="text-sm font-medium">Přetáhni soubory sem nebo klikni</div>
        <div className="text-xs text-subtle">PDF · XLSX · CSV · DOCX · JPG/PNG/HEIC · TXT — max {MAX_FILES} souborů, 4 MB</div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="num text-xs text-subtle">{kb(f.size)}</span>
              <button
                type="button"
                aria-label={`Odebrat ${f.name}`}
                disabled={busy}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="rounded-full p-1 text-subtle hover:bg-bg-elev hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder="Volitelně: vlož plán jako text nebo upřesni (např. „jen první 4 týdny“, „pondělí, středa, pátek“)"
        className="min-h-20 text-sm"
        maxLength={20000}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => camRef.current?.click()} disabled={busy} className="sm:hidden">
          <Camera className="h-4 w-4" /> Vyfotit
        </Button>
        <Button onClick={submit} disabled={busy || tooBig || (!files.length && !text.trim())} className="flex-1 sm:flex-none">
          {busy ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Čtu plán…" : "Vytvořit program z plánu"}
        </Button>
      </div>

      {busy && <p className="text-xs text-muted">Může to trvat až minutu, podle velikosti plánu.</p>}
      {tooBig && <p className="text-sm text-neg">Soubory mají dohromady {kb(total)} – limit je 4 MB.</p>}
      {err && (
        <p role="alert" className="text-sm text-neg">
          {err}
        </p>
      )}
    </Card>
  );
}
