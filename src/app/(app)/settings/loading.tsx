import { SkHeader, SkSectionTitle, SkTextCard, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <Skeleton>
      <SkHeader />
      <div className="space-y-3">
        <SkTextCard lines={2} />
        <SkTextCard lines={1} />
      </div>
      <SkSectionTitle />
      <div className="space-y-3">
        <SkTextCard lines={2} />
        <SkTextCard lines={1} />
        <SkTextCard lines={2} />
      </div>
    </Skeleton>
  );
}
