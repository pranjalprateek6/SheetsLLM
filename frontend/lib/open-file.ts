/**
 * Which file the workspace has open, for the header's crumb. The workspace
 * announces it; the header listens. A window event rather than shared state,
 * so the header needs no search params (and no Suspense) in the layout.
 */
export type OpenFile = { id: string; name: string } | null;

const EVENT = "sllm:open-file";

export function announceOpenFile(file: OpenFile) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenFile>(EVENT, { detail: file }));
}

export function onOpenFile(handler: (file: OpenFile) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<OpenFile>).detail ?? null);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
