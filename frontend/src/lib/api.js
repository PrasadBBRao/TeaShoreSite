/**
 * api.js — thin fetch wrapper for the Teashore backend.
 *
 * Development: all requests go through the Vite dev-server proxy at /api/*,
 * which strips the /api prefix and forwards to http://127.0.0.1:8000.
 *
 * Production: set VITE_API_BASE_URL to the full Railway backend URL
 * (e.g. https://teashore-backend.up.railway.app).  The /api path segment
 * is appended automatically — no trailing slash needed.
 * When the env var is absent the original /api proxy path is used, so
 * local development requires no configuration change.
 */

// VITE_API_BASE_URL is injected at build time by Vite.
// Empty string → fall back to the dev-proxy path /api.
const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : "/api";

/**
 * Fetch a JSON endpoint on the backend.
 *
 * @param {string} path       — e.g. "/menu" or "/menu/categories"
 * @param {RequestInit} init  — optional fetch options (method, headers, body…)
 * @returns {Promise<any>}    — parsed JSON body
 * @throws {Error}            — on network failure OR non-2xx HTTP status
 */
export async function apiFetch(path, init = {}) {
  const url = `${BASE}${path}`;

  // Merge headers first, then spread the rest of init (excluding headers)
  // so that Content-Type is never accidentally overwritten.
  const { headers: extraHeaders, ...restInit } = init;
  const headers = {
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };

  let res;
  try {
    res = await fetch(url, { headers, ...restInit });
  } catch (networkErr) {
    throw new Error("Network error — please check your connection and try again.");
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body?.detail) && body.detail.length > 0) {
        // Pydantic 422 returns detail as a list of validation error objects
        const first = body.detail[0];
        const loc   = first.loc?.slice(1).join(" → ") ?? "";
        detail = loc ? `${loc}: ${first.msg}` : first.msg;
      } else if (body?.detail !== null && typeof body?.detail === "object") {
        // Structured error body e.g. TableInUseResponse on HTTP 409
        detail = body.detail.message ?? JSON.stringify(body.detail);
      }
    } catch {
      // ignore parse failure — use the status-code message above
    }
    if (res.status === 503) detail = "Service temporarily unavailable. Please retry.";
    throw new Error(detail);
  }

  return res.json();
}

/**
 * Like apiFetch but never throws — returns { ok, status, body } so callers
 * that need to inspect structured error bodies (e.g. HTTP 409 TableInUseResponse)
 * can read the raw response without the error-throwing wrapper getting in the way.
 *
 * @param {string} path
 * @param {RequestInit} init
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
export async function apiFetchRaw(path, init = {}) {
  const url = `${BASE}${path}`;
  const { headers: extraHeaders, ...restInit } = init;
  const headers = {
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };
  try {
    const res  = await fetch(url, { headers, ...restInit });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}
