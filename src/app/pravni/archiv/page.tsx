import Link from "next/link";
import { LEGAL } from "@/content/legal.generated";
import { dateLabel } from "@/lib/format";

export const metadata = { title: "Archiv verzí dokumentů" };

export default function Archive() {
  return (
    <div className="legal-prose">
      <h1>Archiv verzí dokumentů</h1>
      <p>Všechna dříve platná znění zůstávají dostupná, abyste vždy viděli, jaké podmínky platily v době vaší registrace.</p>
      {Object.entries(LEGAL).map(([slug, d]) => (
        <section key={slug}>
          <h2>{d.title}</h2>
          <ul>
            {[...d.versions].reverse().map((x, i) => (
              <li key={x.v}>
                <Link href={i === 0 ? `/pravni/${slug}` : `/pravni/${slug}?v=${x.v}`}>
                  Verze {x.v}
                </Link>{" "}
                – účinná od {dateLabel(x.from, { day: "numeric", month: "numeric", year: "numeric" })}
                {i === 0 ? " (aktuální)" : ""}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
