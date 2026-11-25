import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listMyFoods } from "@/lib/nutrition/service";
import { FoodsClient } from "./foods-client";

export default async function FoodsPage() {
  const user = await requireUser();
  const foods = await listMyFoods(user.id);
  return (
    <>
      <PageHeader title="Potraviny" subtitle="Vlastní a oblíbené potraviny" back="/nutrition" />
      <FoodsClient foods={foods} />
    </>
  );
}
