import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOpenFileUrl } from "./use-open-file-url";

// A tiny stand-in for the App Router: replace() rewrites the query string
// that useSearchParams reads, the way a real navigation would.
let query = "";
const replace = vi.fn((url: string) => {
  query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

describe("useOpenFileUrl", () => {
  beforeEach(() => {
    query = "";
    replace.mockClear();
  });

  it("opens the file a URL names on first load", () => {
    query = "file_id=abc";
    const onOpen = vi.fn();
    renderHook(() => useOpenFileUrl(onOpen));
    expect(onOpen).toHaveBeenCalledWith("abc");
  });

  it("writes the open file into the URL without loading it a second time", () => {
    const onOpen = vi.fn();
    const { result, rerender } = renderHook(() => useOpenFileUrl(onOpen));
    act(() => result.current.showFileInUrl("new-upload"));
    expect(replace).toHaveBeenCalledWith("/workspace?file_id=new-upload", { scroll: false });

    rerender();
    expect(result.current.urlFileId).toBe("new-upload");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("clears the URL when the file is closed", () => {
    query = "file_id=abc";
    const { result, rerender } = renderHook(() => useOpenFileUrl(vi.fn()));
    act(() => result.current.showFileInUrl(undefined));
    expect(replace).toHaveBeenCalledWith("/workspace", { scroll: false });
    rerender();
    expect(result.current.urlFileId).toBeNull();
  });

  it("opens a different file when the URL changes to it from outside", () => {
    query = "file_id=abc";
    const onOpen = vi.fn();
    const { rerender } = renderHook(() => useOpenFileUrl(onOpen));
    query = "file_id=xyz";
    rerender();
    expect(onOpen).toHaveBeenLastCalledWith("xyz");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
