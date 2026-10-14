"use client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/track";

/** The tool's call to action: sign up and open this result in the app,
 *  attributed to the tool it came from. */
export default function OpenInAppLink({ slug }: { slug: string }) {
  return (
    <Button variant="inverse" className="h-9 px-4" asChild>
      <Link
        href={`/auth?mode=signup&from=tool-${slug}&next=${encodeURIComponent("/workspace?import=tool")}`}
        onClick={() => track("tool_cta_clicked", { tool: slug })}
      >
        Open the result in SheetsLLM
      </Link>
    </Button>
  );
}
