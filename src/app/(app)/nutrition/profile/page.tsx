import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getTargetsDetail } from "@/lib/nutrition/service";
import { ProfileForm } from "./profile-form";

export default async function NutritionProfilePage() {
  const user = await requireUser();
  const data = await getTargetsDetail(user.id);
  return (
    <>
      <PageHeader title="Profil a cíle" subtitle="Výpočet denního příjmu a maker" back="/nutrition" />
      <ProfileForm {...data} />
    </>
  );
}
