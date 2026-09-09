import {
  PageShell,
  TitleSkeleton,
  TrackListSkeleton,
} from "@/components/client/Skeletons";

export default function Loading() {
  return (
    <PageShell>
      <TitleSkeleton />
      <TrackListSkeleton />
    </PageShell>
  );
}
