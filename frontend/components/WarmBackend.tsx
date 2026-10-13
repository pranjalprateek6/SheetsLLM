"use client";
import { useEffect } from "react";

/* The backend sleeps when nobody has used it for a while and takes up to a
   minute to wake. One request the moment any page loads means it is waking
   while the visitor reads, not after they drop a file. Once per page load;
   the answer is not needed. */

export default function WarmBackend() {
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { cache: "no-store", signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, []);
  return null;
}
