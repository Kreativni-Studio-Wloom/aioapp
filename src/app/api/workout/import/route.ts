import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { AiDisabledError, aiEnabled } from "@/lib/ai";
import { IMPORT_MAX_BYTES, IMPORT_MAX_FILES, importProgramFromFiles, type ImportFile } from "@/lib/workout/import";
import { WorkoutError } from "@/lib/workout/service";

export const maxDuration = 300;

/** Multipart: `files` (0–10) + optional `text`. Returns `{ id }` of the new program. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Nejsi přihlášený." }, { status: 401 });
  if (!aiEnabled()) return Response.json({ error: new AiDisabledError().message }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Soubory se nepodařilo nahrát – možná jsou moc velké." }, { status: 400 });
  }
  const uploads = form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (uploads.length > IMPORT_MAX_FILES) return Response.json({ error: `Nejvýš ${IMPORT_MAX_FILES} souborů.` }, { status: 400 });
  const total = uploads.reduce((s, f) => s + f.size, 0);
  if (total > IMPORT_MAX_BYTES) return Response.json({ error: "Soubory jsou dohromady větší než 4 MB." }, { status: 413 });

  const files: ImportFile[] = await Promise.all(uploads.map(async (f) => ({ name: f.name || "soubor", type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
  const text = form.get("text");

  try {
    const program = await importProgramFromFiles(user.id, files, typeof text === "string" ? text : null);
    revalidatePath("/workout", "layout");
    return Response.json({ id: program.id });
  } catch (err) {
    if (err instanceof WorkoutError || err instanceof AiDisabledError) return Response.json({ error: err.message }, { status: 422 });
    console.error("[workout import]", err);
    return Response.json({ error: "Plán se nepodařilo zpracovat. Zkus to znovu." }, { status: 500 });
  }
}
