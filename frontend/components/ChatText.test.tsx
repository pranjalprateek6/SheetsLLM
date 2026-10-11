import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChatText from "@/components/ChatText";

describe("ChatText", () => {
  it("draws headings and divider lines instead of showing the markdown", () => {
    const { container } = render(
      <ChatText text={"### Column Overview\n- **Order ID**: unique\n\n---\n\n## Things that look off\n1. Region is often empty"} />,
    );
    expect(screen.getByText("Column Overview")).toBeInTheDocument();
    expect(screen.getByText("Things that look off")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/#|---/);
    expect(container.querySelectorAll("hr")).toHaveLength(1);
    expect(container.querySelector("strong")?.textContent).toBe("Order ID");
  });

  it("keeps a hyphenated sentence and a bullet as text", () => {
    const { container } = render(<ChatText text={"Well-formed - mostly.\n- one item"} />);
    expect(container.textContent).toContain("Well-formed - mostly.");
    expect(container.querySelectorAll("hr")).toHaveLength(0);
    expect(container.querySelectorAll("li")).toHaveLength(1);
  });
});
