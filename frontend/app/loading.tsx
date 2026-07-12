import { TextShimmer } from "@/components/ui/text-shimmer";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <TextShimmer className="text-sm" duration={1.2}>
        Loading…
      </TextShimmer>
    </div>
  );
}
