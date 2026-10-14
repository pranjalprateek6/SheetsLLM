import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loading, dismiss } = vi.hoisted(() => ({ loading: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: { loading, dismiss } }));
const auth = vi.hoisted(() => ({
  session: null as null | { access_token: string },
  refreshed: null as null | { access_token: string },
  signOut: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      refreshSession: async () => ({ data: { session: auth.refreshed }, error: auth.refreshed ? null : new Error("no") }),
      signOut: auth.signOut,
    },
  },
}));

import { fetchWithAuth, WAKING_AFTER_MS } from "./fetch-with-auth";

function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((res) => { resolve = res; });
  return { promise, resolve };
}

describe("fetchWithAuth and the sleeping server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loading.mockClear();
    dismiss.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("says the server is starting once a request has waited, and takes it back when it answers", async () => {
    const d = deferred();
    vi.stubGlobal("fetch", vi.fn(() => d.promise));
    const call = fetchWithAuth("/api/files");
    await vi.advanceTimersByTimeAsync(WAKING_AFTER_MS - 1);
    expect(loading).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(loading).toHaveBeenCalledTimes(1);
    expect(loading.mock.calls[0][0]).toMatch(/Starting the server/);
    expect(loading.mock.calls[0][1]).toMatchObject({ id: "waking" });

    d.resolve(new Response("{}", { status: 200 }));
    await call;
    expect(dismiss).toHaveBeenCalledWith("waking");
  });

  it("says nothing for a request that answers in time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await fetchWithAuth("/api/files");
    await vi.advanceTimersByTimeAsync(WAKING_AFTER_MS + 100);
    expect(loading).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("shows one notice for several slow requests, gone when the last answers", async () => {
    const a = deferred();
    const b = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    vi.stubGlobal("fetch", fetchMock);
    const ca = fetchWithAuth("/api/files");
    const cb = fetchWithAuth("/api/usage");
    await vi.advanceTimersByTimeAsync(WAKING_AFTER_MS);
    expect(loading).toHaveBeenCalledTimes(1);

    a.resolve(new Response("{}"));
    await ca;
    expect(dismiss).not.toHaveBeenCalled();
    b.resolve(new Response("{}"));
    await cb;
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("takes the notice back when a slow request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("down")), WAKING_AFTER_MS + 500))));
    const call = fetchWithAuth("/api/files").catch((e) => e);
    await vi.advanceTimersByTimeAsync(WAKING_AFTER_MS + 600);
    expect(await call).toBeInstanceOf(Error);
    expect(loading).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("waking");
  });

  it("refreshes the session once on a 401 and retries with the new token", async () => {
    vi.useRealTimers();
    auth.session = { access_token: "stale" };
    auth.refreshed = { access_token: "fresh" };
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const token = new Headers(init.headers).get("Authorization") ?? "";
      seen.push(token);
      return token === "Bearer fresh" ? new Response("{}", { status: 200 }) : new Response("{}", { status: 401 });
    }));
    const r = await fetchWithAuth("/api/files");
    expect(r.status).toBe(200);
    expect(seen).toEqual(["Bearer stale", "Bearer fresh"]);
    expect(auth.signOut).not.toHaveBeenCalled();
    auth.session = null;
    auth.refreshed = null;
  });

  it("signs out with a way back when the refresh does not help", async () => {
    vi.useRealTimers();
    auth.session = { access_token: "stale" };
    auth.refreshed = null;
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/workspace", search: "?file_id=f1", assign });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await fetchWithAuth("/api/files");
    expect(auth.signOut).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/auth?expired=1&next=%2Fworkspace%3Ffile_id%3Df1");
    auth.session = null;
  });
});
