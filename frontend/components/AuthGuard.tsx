"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { TextShimmer } from "@/components/ui/text-shimmer";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <TextShimmer className="text-sm" duration={1.2}>Authenticating...</TextShimmer>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
