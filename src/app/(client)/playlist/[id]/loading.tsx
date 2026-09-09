import {
  PageHeaderSkeleton,
  PageShell,
  TrackListSkeleton,
} from "@/components/client/Skeletons";

export default function Loading() {
  return (
    <PageShell>
      <PageHeaderSkeleton />
      <div className="mt-8">
        <TrackListSkeleton />
      </div>
    </PageShell>
  );
}
