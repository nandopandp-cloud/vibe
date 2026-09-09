import { TrackListSkeleton } from "@/components/client/Skeletons";

export default function Loading() {
  return (
    <div className="pb-12">
      <header className="flex flex-col gap-6 px-6 pb-8 pt-10 md:flex-row md:items-end md:px-8">
        <div className="h-40 w-40 shrink-0 animate-pulse rounded-full bg-surface-2 md:h-52 md:w-52" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
          <div className="mt-3 h-12 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 h-3.5 w-56 animate-pulse rounded bg-surface-2" />
          <div className="mt-6 flex gap-3">
            <div className="h-12 w-40 animate-pulse rounded-full bg-surface-2" />
            <div className="h-12 w-32 animate-pulse rounded-full bg-surface-2" />
          </div>
        </div>
      </header>
      <div className="px-6 md:px-8">
        <TrackListSkeleton />
      </div>
    </div>
  );
}
