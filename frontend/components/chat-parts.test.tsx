import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHEF_VERBS, Thinking } from "@/components/chat-parts";

const shown = () => {
  const words = CHEF_VERBS.map((v) => `${v}…`);
  return words.find((w) => screen.queryByText(w)) ?? null;
};

describe("Thinking", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("walks through verbs about the data, never the same one twice in a row", () => {
    render(<Thinking />);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const now = shown();
      expect(now).not.toBeNull();
      if (seen.length) expect(now).not.toBe(seen[seen.length - 1]);
      seen.push(now!);
      act(() => { vi.advanceTimersByTime(2400); });
    }
  });

  it("never claims to be writing SQL, since Chef may only be answering", () => {
    expect(CHEF_VERBS.join(" ")).not.toMatch(/SQL|Validat|Running on your data/i);
  });

  it("shows a given label as it is", () => {
    render(<Thinking label="Reading your columns…" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("Reading your columns…")).toBeInTheDocument();
    expect(shown()).toBeNull();
  });

  it("offers Esc only for work that can be stopped", () => {
    const { unmount } = render(<Thinking />);
    expect(screen.getByText(/esc to stop/)).toBeInTheDocument();
    unmount();
    render(<Thinking label="Reading your columns…" stoppable={false} />);
    expect(screen.queryByText(/esc to stop/)).not.toBeInTheDocument();
  });

  it("holds one plain word when motion is reduced", () => {
    render(<Thinking reduced />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("Working…")).toBeInTheDocument();
  });
});
