import {
  CardGridSkeleton,
  PageShell,
  TitleSkeleton,
} from "@/components/client/Skeletons";

export default function Loading() {
  return (
    <PageShell>
      <TitleSkeleton />
      <CardGridSkeleton />
    </PageShell>
  );
}
