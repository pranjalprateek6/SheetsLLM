import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loading, dismiss } = vi.hoisted(() => ({ loading: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: { loading, dismiss } }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
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
});
