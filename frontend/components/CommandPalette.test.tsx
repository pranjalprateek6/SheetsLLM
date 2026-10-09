import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import CommandPalette from "./CommandPalette";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeAll(() => {
  // cmdk and Radix measure and scroll; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

function renderPalette(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(), onUpload: vi.fn(), onUndo: vi.fn(), onDownload: vi.fn(),
    onCloseFile: vi.fn(), onChat: vi.fn(), onHistory: vi.fn(),
  };
  render(<CommandPalette open fileId="f1" {...handlers} {...props} />);
  return handlers;
}

describe("CommandPalette", () => {
  it("names the action for what it does: Close file, not Reset file", () => {
    renderPalette();
    expect(screen.getByText("Close file")).toBeInTheDocument();
    expect(screen.queryByText("Reset file")).not.toBeInTheDocument();
  });

  it("Close file calls the close handler", async () => {
    const h = renderPalette();
    await userEvent.click(screen.getByText("Close file"));
    await waitFor(() => expect(h.onCloseFile).toHaveBeenCalledTimes(1));
  });

  it("offers no Close file with no file open", () => {
    renderPalette({ fileId: undefined });
    expect(screen.queryByText("Close file")).not.toBeInTheDocument();
  });
});
