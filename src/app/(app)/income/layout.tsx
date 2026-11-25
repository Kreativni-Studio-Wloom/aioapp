import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getPickerData } from "@/lib/income/service";
import { TxSheetProvider } from "./_components/tx-sheet";

export default async function IncomeLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const data = await getPickerData(user.id);
  return <TxSheetProvider data={data}>{children}</TxSheetProvider>;
}
