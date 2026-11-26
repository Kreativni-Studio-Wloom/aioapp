import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LEGAL } from "@/content/legal.generated";

type Slug = keyof typeof LEGAL;
const isSlug = (s: string): s is Slug => s in LEGAL;

export function generateStaticParams() {
  return Object.keys(LEGAL).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/pravni/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  return { title: isSlug(doc) ? LEGAL[doc].title : "Dokument" };
}

export default async function LegalDoc({ params, searchParams }: PageProps<"/pravni/[doc]">) {
  const { doc } = await params;
  if (!isSlug(doc)) notFound();
  const { v } = (await searchParams) as { v?: string };
  const versions = LEGAL[doc].versions as readonly { v: string; from: string; html: string }[];
  const current = versions[versions.length - 1];
  const shown = v ? versions.find((x) => x.v === v) : current;
  if (!shown) notFound();
  return (
    <article>
      {shown !== current && (
        <p className="mb-6 rounded-xl bg-card px-4 py-3 text-sm text-muted">
          Archivní verze {shown.v}. Aktuální znění je verze {current.v}.{" "}
          <a href={`/pravni/${doc}`} className="text-fg underline underline-offset-4">
            Zobrazit aktuální
          </a>
        </p>
      )}
      {/* Content is generated at build time from our own Markdown in /pravni – no user input. */}
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: shown.html }} />
    </article>
  );
}
