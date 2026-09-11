import {
  PageShell,
  PeopleListSkeleton,
  TitleSkeleton,
} from "@/components/client/Skeletons";

export default function Loading() {
  return (
    <PageShell>
      <TitleSkeleton />
      <div className="mb-8 h-[104px] animate-pulse rounded-2xl bg-surface-2" />
      <PeopleListSkeleton />
    </PageShell>
  );
}
