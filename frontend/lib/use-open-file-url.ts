"use client";
import { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Keeps the open file in the URL (`/workspace?file_id=…`) so a refresh, a
 * shared link or the back button lands on the same file.
 *
 * `onOpen` runs when the URL names a file the page did not put there itself:
 * a first load, or a link from elsewhere. `showFileInUrl` writes the open
 * file (or none) into the URL with replace, and remembers it, so that write
 * does not come back around as a request to load the file again.
 */
export function useOpenFileUrl(onOpen: (fileId: string) => void) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlFileId = searchParams.get("file_id");

  const shownRef = useRef<string | undefined>(undefined);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (urlFileId && urlFileId !== shownRef.current) {
      shownRef.current = urlFileId;
      onOpenRef.current(urlFileId);
    }
  }, [urlFileId]);

  const showFileInUrl = useCallback(
    (fileId: string | undefined) => {
      shownRef.current = fileId;
      router.replace(fileId ? `/workspace?file_id=${encodeURIComponent(fileId)}` : "/workspace", {
        scroll: false,
      });
    },
    [router],
  );

  return { urlFileId, showFileInUrl };
}
