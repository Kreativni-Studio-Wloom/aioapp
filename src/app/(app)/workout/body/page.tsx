import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isoDate } from "@/lib/format";
import { getBodyMetrics } from "@/lib/workout/service";
import { BodyView } from "./body-view";

export default async function BodyPage() {
  const user = await requireUser();
  const metrics = await getBodyMetrics(user.id, 365);
  return (
    <>
      <PageHeader title="Tělo" subtitle="Váha, % tuku a obvod pasu" back="/workout" />
      <BodyView metrics={metrics} today={isoDate()} />
    </>
  );
}
