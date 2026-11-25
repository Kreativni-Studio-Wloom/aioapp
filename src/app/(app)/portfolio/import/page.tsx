import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ImportClient } from "./import-client";

export default async function PortfolioImportPage() {
  await requireUser();
  return (
    <>
      <PageHeader back="/portfolio" title="Import CSV" subtitle="Nákupy, prodeje a dividendy z brokera nebo tabulky" />
      <ImportClient />
    </>
  );
}
