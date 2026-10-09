/* Default stubs for the Next.js /api proxy routes, shaped like the backend's
   real responses. A test that needs a different answer overrides a handler
   with server.use(...) for its own duration; resetHandlers() in setup.ts
   puts these back afterwards. */
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const usage = {
  tier: "free",
  month: "2026-10-01",
  used: { uploads: 0, transforms: 0, chat_requests: 0, rows_processed: 0 },
  limits: { uploads: 50, transforms: 200, chat_requests: 200 },
};

export const handlers = [
  http.get("/api/files", () => HttpResponse.json({ files: [], total: 0, page: 1, page_size: 20 })),
  http.get("/api/usage", () => HttpResponse.json(usage)),
  http.get("/api/settings", () => HttpResponse.json({ privacy_mode: true })),
  http.get("/api/recipes", () => HttpResponse.json({ recipes: [], total: 0 })),
  // Billing is off until Razorpay is configured: the waitlist path
  http.get("/api/billing/status", () => HttpResponse.json({ tier: "free", billing_configured: false })),
  http.post("/api/billing/waitlist", () => HttpResponse.json({ joined: true })),
  http.get("/api/insights/:fileId", ({ params }) =>
    HttpResponse.json({ file_id: params.fileId, insights: { suggestions: [] } })
  ),
];

export const server = setupServer(...handlers);
