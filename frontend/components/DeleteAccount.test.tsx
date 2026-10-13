import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import DeleteAccount from "./DeleteAccount";

const signOut = vi.fn(async () => {});
const push = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ signOut }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const EMAIL = "ana@example.com";

function openDialog() {
  render(<DeleteAccount email={EMAIL} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByLabelText("Type your email to confirm");
}

describe("DeleteAccount", () => {
  beforeEach(() => {
    signOut.mockClear();
    push.mockClear();
  });

  it("will not delete until the sign-in address is typed out", () => {
    const input = openDialog();
    const action = screen.getByRole("button", { name: "Delete everything" });
    expect(action).toBeDisabled();
    fireEvent.change(input, { target: { value: "ana@example" } });
    expect(action).toBeDisabled();
    fireEvent.change(input, { target: { value: " ANA@example.com " } });
    expect(action).toBeEnabled();
  });

  it("deletes, signs out and goes home", async () => {
    let method = "";
    server.use(
      http.delete("/api/account", ({ request }) => {
        method = request.method;
        return HttpResponse.json({ deleted: true, files: 2 });
      }),
    );
    const input = openDialog();
    fireEvent.change(input, { target: { value: EMAIL } });
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(method).toBe("DELETE");
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and shows the reason when deletion fails", async () => {
    server.use(
      http.delete("/api/account", () =>
        HttpResponse.json(
          { code: "SUBSCRIPTION_NOT_CANCELLED", message: "We couldn't cancel your Pro subscription, so nothing was deleted." },
          { status: 502 },
        ),
      ),
    );
    const input = openDialog();
    fireEvent.change(input, { target: { value: EMAIL } });
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("nothing was deleted");
    expect(screen.getByRole("button", { name: "Delete everything" })).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
