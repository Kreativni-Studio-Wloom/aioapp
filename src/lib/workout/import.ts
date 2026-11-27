// Import an existing training plan from any file (PDF, spreadsheet, document, photo, text)
// → Claude reads it → a new program with exercises matched to the library.
import type Anthropic from "@anthropic-ai/sdk";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { z } from "zod";
import type { Equipment } from "@/db/schema";
import { aiStructured } from "@/lib/ai";
import { EQUIPMENT, MUSCLES, PATTERNS } from "./constants";
import { createExercise, createProgram, listExercises, normalize, WorkoutError, type ProgramDTO } from "./service";

export type ImportFile = { name: string; type: string; bytes: Uint8Array };

export const IMPORT_MAX_FILES = 10;
export const IMPORT_MAX_BYTES = 4_000_000; // Vercel caps request bodies at 4.5 MB
const MAX_TEXT_CHARS = 120_000;

/* ───────────────────────────── File → content blocks ───────────────────────────── */

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const SHEET_EXT = new Set(["xlsx", "xlsm", "xlsb", "xls", "ods", "fods", "numbers"]);
const ZIP_DOC_EXT = new Set(["docx", "odt", "pptx", "odp"]);
const TEXT_EXT = new Set(["csv", "tsv", "txt", "md", "markdown", "json", "xml", "html", "htm", "rtf", "yaml", "yml", "log"]);

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Office/ODF XML → readable text (paragraphs on lines, table cells separated by tabs). */
function xmlToText(xml: string) {
  return decodeEntities(
    xml
      .replace(/<(w:tab|text:tab)\b[^>]*\/>/g, "\t")
      .replace(/<\/(w:tc|table:table-cell|a:tc)>/g, "\t")
      .replace(/<(w:br|text:line-break)\b[^>]*\/>/g, "\n")
      .replace(/<\/(w:p|text:p|text:h|a:p|w:tr|table:table-row|a:tr)>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function zipDocText(bytes: Uint8Array, e: string) {
  const files = unzipSync(bytes, {
    filter: (f) =>
      f.name === "word/document.xml" || f.name === "content.xml" || /^ppt\/slides\/slide\d+\.xml$/.test(f.name) || /^word\/(header|footer)\d*\.xml$/.test(f.name),
  });
  const names = Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!names.length) throw new WorkoutError(`Soubor .${e} se nepodařilo přečíst.`);
  return names.map((n) => xmlToText(strFromU8(files[n]))).join("\n\n");
}

function sheetText(bytes: Uint8Array) {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true, dense: true });
  return wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false, strip: true });
    return csv.trim() ? `### List „${name}“\n${csv.trim()}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

function looksLikeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 4000);
  let bad = 0;
  for (const c of sample) if (c === 0 || (c < 9 && c !== 0)) bad++;
  return sample.length > 0 && bad / sample.length < 0.01;
}

function decodeText(bytes: Uint8Array) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // Many Czech CSV exports from Excel are windows-1250.
  return utf8.includes("�") ? new TextDecoder("windows-1250").decode(bytes) : utf8;
}

function textBlock(name: string, text: string): Anthropic.TextBlockParam {
  const t = text.trim();
  if (!t) throw new WorkoutError(`Soubor „${name}“ je prázdný.`);
  const clipped = t.length > MAX_TEXT_CHARS ? `${t.slice(0, MAX_TEXT_CHARS)}\n…(zkráceno)` : t;
  return { type: "text", text: `=== Soubor: ${name} ===\n${clipped}` };
}

/** Turn one uploaded file into content Claude can read. */
export function fileToBlocks(f: ImportFile): Anthropic.ContentBlockParam[] {
  const e = ext(f.name);
  const mime = f.type.toLowerCase();

  if (e === "pdf" || mime === "application/pdf") {
    return [
      { type: "text", text: `=== Soubor: ${f.name} (PDF) ===` },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(f.bytes) } },
    ];
  }
  const img = IMAGE_TYPES[e] ?? Object.values(IMAGE_TYPES).find((m) => m === mime);
  if (img) {
    return [
      { type: "text", text: `=== Fotka / obrázek: ${f.name} ===` },
      { type: "image", source: { type: "base64", media_type: img, data: b64(f.bytes) } },
    ];
  }
  if (mime.startsWith("image/") || ["heic", "heif", "tif", "tiff", "bmp"].includes(e)) {
    throw new WorkoutError(`Obrázek „${f.name}“ má nepodporovaný formát – ulož ho jako JPG nebo PNG.`);
  }
  try {
    if (SHEET_EXT.has(e) || mime.includes("spreadsheet") || mime.includes("excel")) return [textBlock(f.name, sheetText(f.bytes))];
    if (ZIP_DOC_EXT.has(e)) return [textBlock(f.name, zipDocText(f.bytes, e))];
  } catch (err) {
    if (err instanceof WorkoutError) throw err;
    throw new WorkoutError(`Soubor „${f.name}“ se nepodařilo přečíst – je poškozený nebo zaheslovaný?`);
  }
  if (e === "doc" || e === "ppt") throw new WorkoutError(`Starý formát .${e} neumím – ulož soubor jako .docx nebo PDF.`);
  if (TEXT_EXT.has(e) || mime.startsWith("text/") || looksLikeText(f.bytes)) {
    let text = decodeText(f.bytes);
    if (e === "html" || e === "htm" || mime === "text/html") text = xmlToText(text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ""));
    return [textBlock(f.name, text)];
  }
  throw new WorkoutError(`Formát souboru „${f.name}“ neumím přečíst. Zkus PDF, Excel, CSV, Word nebo fotku.`);
}

/* ───────────────────────────── AI extraction ───────────────────────────── */

const ExerciseSchema = z.object({
  name: z.string().describe("Název cviku tak, jak je v plánu (česky, pokud je plán česky)"),
  libraryName: z
    .string()
    .nullable()
    .describe("PŘESNÝ název odpovídajícího cviku z knihovny, pokud jde o stejný cvik (stejný pohyb i vybavení). Jinak null."),
  primaryMuscle: z.enum(MUSCLES).describe("Hlavní procvičovaný sval"),
  pattern: z.enum(PATTERNS).describe("Pohybový vzor"),
  equipment: z.enum(EQUIPMENT as [Equipment, ...Equipment[]]).describe("Vybavení"),
  sets: z.number().describe("Počet pracovních sérií"),
  repMin: z.number().describe("Spodní hranice opakování"),
  repMax: z.number().describe("Horní hranice opakování (stejná jako repMin při pevném počtu)"),
  restSeconds: z.number().nullable().describe("Pauza mezi sériemi v sekundách, pokud je uvedená"),
  targetRpe: z.number().nullable().describe("Cílové RPE, pokud je uvedené (RIR převeď: RPE = 10 − RIR)"),
  notes: z
    .string()
    .nullable()
    .describe("Krátká poznámka: tempo, superserie, váha/% 1RM, čas u výdrží, technika… Jinak null."),
});

export const PlanSchema = z.object({
  isTrainingPlan: z.boolean().describe("false, pokud vstup neobsahuje žádný tréninkový plán"),
  name: z.string().describe("Krátký název programu"),
  description: z.string().nullable().describe("1–3 věty: zaměření, frekvence, případně jak plán progreduje v týdnech"),
  days: z.array(
    z.object({
      name: z.string().describe("Název tréninkového dne, např. „Push“, „Horní A“, „Den 1 – nohy“"),
      weekday: z.number().nullable().describe("Den v týdnu 1 = pondělí … 7 = neděle, pokud ho plán určuje; jinak null"),
      exercises: z.array(ExerciseSchema),
    }),
  ),
});
type Plan = z.infer<typeof PlanSchema>;

const SYSTEM = `Jsi trenér, který převádí existující tréninkové plány do aplikace. Dostaneš soubory (PDF, tabulky, dokumenty, fotky papírů nebo obrazovek, text) a vrátíš strukturovaný program.

Pravidla:
- Každý tréninkový den = jeden den programu, ve stejném pořadí jako v plánu. Rozcvičku, strečink a kardio vynech (pokud nejsou hlavní částí plánu – pak je dej jako cvik s poznámkou).
- Pokud plán obsahuje více týdnů / fází se stejnými dny, vytvoř dny jen jednou podle PRVNÍHO týdne a progresi v týdnech shrň do description.
- Pokud se dny v týdnu opakují (A/B/A), vytvoř každý unikátní den jen jednou.
- Cviky namapuj na knihovnu: libraryName vyplň PŘESNÝM názvem z knihovny jen tehdy, když jde opravdu o stejný cvik (např. „Bench“, „Benchpress“, „Bench press s velkou činkou“ → „Bench press“). Jinak libraryName = null a cvik se založí jako nový – pak name napiš srozumitelně česky.
- Opakování: „8–12“ → 8/12; „10“ → 10/10; „5×5“ → 5 sérií, 5/5; pyramida 12-10-8 → repMin 8, repMax 12; „do selhání“/AMRAP → odhadni rozsah a napiš do poznámky. U výdrží (plank 60 s) dej repMin=repMax=1 a čas do poznámky.
- Když počet sérií chybí, použij 3; když chybí opakování, použij 8–12.
- Pauzu „2 min“ převeď na 120 s, „90 s“ na 90.
- Ručně psané nebo rozmazané fotky čti pozorně; nejasná místa odhadni rozumně.
- Vše piš česky. Pokud ve vstupu není žádný tréninkový plán, vrať isTrainingPlan=false a prázdné dny.`;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export async function importProgramFromFiles(userId: string, files: ImportFile[], hint?: string | null): Promise<ProgramDTO> {
  const note = hint?.trim().slice(0, 20_000) ?? "";
  if (!files.length && !note) throw new WorkoutError("Nahraj soubor nebo vlož text plánu.");
  if (files.length > IMPORT_MAX_FILES) throw new WorkoutError(`Najednou můžeš nahrát nejvýš ${IMPORT_MAX_FILES} souborů.`);

  const blocks = files.flatMap(fileToBlocks);
  const library = await listExercises(userId);
  const libText = library.map((e) => e.name).join("\n");

  const plan: Plan = await aiStructured({
    system: SYSTEM,
    content: [
      ...blocks,
      {
        type: "text",
        text: `${note ? `Text / upřesnění od uživatele:\n"""${note}"""\n\n` : ""}Knihovna cviků (pro libraryName):\n${libText}\n\nPřeveď tréninkový plán výše na program.`,
      },
    ],
    schema: PlanSchema,
    effort: "medium",
    maxTokens: 16000,
  });

  const days = plan.days.filter((d) => d.exercises.length > 0).slice(0, 14);
  if (!plan.isTrainingPlan || !days.length) throw new WorkoutError("V nahraném souboru jsem nenašel žádný tréninkový plán.");

  // Resolve exercises: library match → existing by normalized name → create custom.
  const byName = new Map(library.map((e) => [normalize(e.name), e.id]));
  const resolve = async (x: Plan["days"][number]["exercises"][number]) => {
    for (const n of [x.libraryName, x.name]) {
      const id = n ? byName.get(normalize(n)) : undefined;
      if (id) return id;
    }
    const name = x.name.trim().slice(0, 80) || "Cvik";
    const created = await createExercise(userId, { name, primaryMuscle: x.primaryMuscle, pattern: x.pattern, equipment: x.equipment });
    byName.set(normalize(name), created.id);
    return created.id;
  };

  const resolvedDays = [];
  for (const [i, d] of days.entries()) {
    const exercises = [];
    for (const x of d.exercises.slice(0, 30)) {
      const repMin = clampInt(x.repMin, 1, 100, 8);
      const rpe = x.targetRpe == null ? null : Number(x.targetRpe);
      exercises.push({
        exerciseId: await resolve(x),
        sets: clampInt(x.sets, 1, 20, 3),
        repMin,
        repMax: Math.max(repMin, clampInt(x.repMax, 1, 100, repMin)),
        restSeconds: x.restSeconds == null ? null : clampInt(x.restSeconds, 0, 900, 120),
        targetRpe: rpe != null && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null,
        notes: x.notes?.trim().slice(0, 500) || null,
      });
    }
    const wd = d.weekday == null ? null : clampInt(d.weekday, 1, 7, 1);
    resolvedDays.push({ name: d.name.trim().slice(0, 60) || `Den ${i + 1}`, weekday: wd, exercises });
  }

  return createProgram(userId, {
    name: plan.name.trim().slice(0, 80) || "Importovaný program",
    description: plan.description?.trim().slice(0, 500) || null,
    days: resolvedDays,
  });
}
