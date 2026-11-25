import { z } from "zod";
import { aiStructured, imageBlock } from "@/lib/ai";

/** One estimated food item (absolute values for the portion, not per 100 g). */
export type AiFoodItem = {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** 0–1 */
  confidence: number;
};

const ItemSchema = z.object({
  name: z.string().describe("Krátký český název potraviny / jídla"),
  grams: z.number().describe("Odhadovaná hmotnost porce v gramech"),
  kcal: z.number().describe("Energie porce v kcal"),
  protein: z.number().describe("Bílkoviny porce v g"),
  carbs: z.number().describe("Sacharidy porce v g"),
  fat: z.number().describe("Tuky porce v g"),
  fiber: z.number().describe("Vláknina porce v g"),
  confidence: z.number().describe("Jistota odhadu 0–1"),
});
const ResultSchema = z.object({ items: z.array(ItemSchema) });

const BASE_RULES = `Jsi nutriční asistent. Odhaduješ nutriční hodnoty jídel.
Pravidla:
- Vrať seznam položek; každou samostatnou potravinu / komponentu jídla zvlášť (např. "rýže", "kuřecí prsa", "omáčka").
- Všechny hodnoty jsou ABSOLUTNÍ pro danou porci (ne na 100 g).
- Názvy česky, stručně.
- Pokud množství není uvedeno, odhadni běžnou porci (např. 1 vejce ≈ 55 g, banán ≈ 120 g bez slupky, krajíc chleba ≈ 45 g).
- Hodnoty vycházej z běžných nutričních tabulek (syrové vs. vařené rozlišuj podle kontextu).
- Kontrola: kcal ≈ 4×bílkoviny + 4×sacharidy + 9×tuky (±15 %).
- confidence: 0.9 při jasně daném množství a známé potravině, 0.5 při odhadu porce, 0.3 při velké nejistotě.
- Pokud vstup neobsahuje žádné jídlo, vrať prázdný seznam.`;

function clean(items: z.infer<typeof ItemSchema>[]): AiFoodItem[] {
  const r1 = (x: number) => Math.round(Math.max(0, Number(x) || 0) * 10) / 10;
  return items
    .filter((i) => i.name?.trim())
    .map((i) => ({
      name: i.name.trim().slice(0, 120),
      grams: Math.round(Math.max(0, Number(i.grams) || 0)),
      kcal: Math.round(Math.max(0, Number(i.kcal) || 0)),
      protein: r1(i.protein),
      carbs: r1(i.carbs),
      fat: r1(i.fat),
      fiber: r1(i.fiber),
      confidence: Math.max(0, Math.min(1, Number(i.confidence) || 0)),
    }));
}

/** Free-text meal description → items. Throws AiDisabledError when AI is not configured. */
export async function estimateFromText(text: string): Promise<AiFoodItem[]> {
  const input = text.trim().slice(0, 2000);
  if (!input) return [];
  const res = await aiStructured({
    system: BASE_RULES,
    content: `Popis toho, co jsem snědl(a):\n"""${input}"""`,
    schema: ResultSchema,
    maxTokens: 4000,
  });
  return clean(res.items);
}

/** Photo (data URL) → items. Throws AiDisabledError when AI is not configured. */
export async function estimateFromImage(dataUrl: string, hint?: string | null): Promise<AiFoodItem[]> {
  const res = await aiStructured({
    system: `${BASE_RULES}
- Dostaneš fotku jídla. Rozpoznej jednotlivé komponenty a odhadni jejich hmotnost podle velikosti talíře, příboru a obvyklých porcí.
- Pokud je na fotce obal s nutriční tabulkou, použij hodnoty z ní.`,
    content: [
      imageBlock(dataUrl),
      { type: "text", text: hint?.trim() ? `Upřesnění od uživatele: ${hint.trim().slice(0, 500)}` : "Odhadni nutriční hodnoty jídla na fotce." },
    ],
    schema: ResultSchema,
    effort: "medium",
    maxTokens: 4000,
  });
  return clean(res.items);
}
