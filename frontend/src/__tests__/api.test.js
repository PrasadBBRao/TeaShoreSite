/**
 * api.test.js — Unit tests for apiFetch and apiFetchRaw.
 *
 * T9: apiFetch with 409 dict detail returns the message string, not [object Object]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, apiFetchRaw } from '../lib/api';

// Helper to create a mock Response
function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch — error detail parsing', () => {
  it('T9a: returns message from structured 409 dict detail', async () => {
    fetch.mockResolvedValue(mockResponse(409, {
      detail: {
        table_in_use: true,
        table_number: 2,
        message: 'Table 2 already has an active session. Please ask a staff member.',
      },
    }));

    await expect(apiFetch('/qr/scan', { method: 'POST', body: '{}' }))
      .rejects.toThrow('Table 2 already has an active session.');
  });

  it('T9b: does not throw [object Object] for dict detail', async () => {
    fetch.mockResolvedValue(mockResponse(409, {
      detail: { table_in_use: true, table_number: 3, message: 'Occupied.' },
    }));

    let errorMsg = '';
    try {
      await apiFetch('/qr/scan', { method: 'POST', body: '{}' });
    } catch (e) {
      errorMsg = e.message;
    }
    expect(errorMsg).not.toBe('[object Object]');
    expect(errorMsg).toBe('Occupied.');
  });

  it('T9c: still parses plain string detail correctly', async () => {
    fetch.mockResolvedValue(mockResponse(401, { detail: 'Unauthorized.' }));

    await expect(apiFetch('/orders')).rejects.toThrow('Unauthorized.');
  });

  it('T9d: still parses Pydantic 422 array detail correctly', async () => {
    fetch.mockResolvedValue(mockResponse(422, {
      detail: [{ loc: ['body', 'qr_secret'], msg: 'field required' }],
    }));

    await expect(apiFetch('/qr/scan', { method: 'POST', body: '{}' }))
      .rejects.toThrow('qr_secret: field required');
  });

  it('T9e: falls back to status message when detail is absent', async () => {
    fetch.mockResolvedValue(mockResponse(500, {}));

    await expect(apiFetch('/orders')).rejects.toThrow('Request failed (500)');
  });
});

describe('apiFetchRaw — never throws', () => {
  it('returns ok:true and body on success', async () => {
    fetch.mockResolvedValue(mockResponse(200, { session_id: 'abc' }));

    const result = await apiFetchRaw('/qr/scan', { method: 'POST', body: '{}' });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body.session_id).toBe('abc');
  });

  it('returns ok:false and body on 409 without throwing', async () => {
    fetch.mockResolvedValue(mockResponse(409, {
      detail: { table_in_use: true, table_number: 1, message: 'In use.' },
    }));

    const result = await apiFetchRaw('/qr/scan', { method: 'POST', body: '{}' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.body.detail.table_in_use).toBe(true);
    expect(result.body.detail.table_number).toBe(1);
  });

  it('returns ok:false, status:0 on network failure', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await apiFetchRaw('/qr/scan', { method: 'POST', body: '{}' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.body).toBeNull();
  });
});

// ── T-BASE: BASE URL construction ─────────────────────────────────────────
//
// BASE is a module-level constant derived from import.meta.env.VITE_API_BASE_URL
// at import time.  To test different values we must:
//   1. vi.stubEnv()  — set the env var before the module loads
//   2. vi.resetModules() — discard the cached module so it re-evaluates BASE
//   3. dynamic import() — load the fresh module with the new BASE value
//   4. vi.unstubAllEnvs() + vi.resetModules() in afterEach — clean up
//
// fetch is stubbed to a no-op so these tests never hit the network.

describe('BASE URL construction', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('T-BASE-1: no VITE_API_BASE_URL → fetch uses /api/<path> (dev proxy)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.resetModules();
    const { apiFetch: apiFetchFresh } = await import('../lib/api');

    await apiFetchFresh('/menu').catch(() => {});
    expect(fetch).toHaveBeenCalledOnce();
    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toBe('/api/menu');
  });

  it('T-BASE-2: VITE_API_BASE_URL set → fetch uses the Railway root URL directly', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://teashoresite-production.up.railway.app');
    vi.resetModules();
    const { apiFetch: apiFetchFresh } = await import('../lib/api');

    await apiFetchFresh('/menu').catch(() => {});
    expect(fetch).toHaveBeenCalledOnce();
    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toBe('https://teashoresite-production.up.railway.app/menu');
  });

  it('T-BASE-3: VITE_API_BASE_URL with trailing slash → slash is stripped', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://teashoresite-production.up.railway.app/');
    vi.resetModules();
    const { apiFetch: apiFetchFresh } = await import('../lib/api');

    await apiFetchFresh('/orders').catch(() => {});
    const calledUrl = fetch.mock.calls[0][0];
    // Must NOT produce double-slash or extra /api segment
    expect(calledUrl).toBe('https://teashoresite-production.up.railway.app/orders');
    expect(calledUrl).not.toContain('//orders');
    expect(calledUrl).not.toContain('/api/');
  });

  it('T-BASE-4: production URL never contains /api/ segment', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://teashoresite-production.up.railway.app');
    vi.resetModules();
    const { apiFetch: apiFetchFresh } = await import('../lib/api');

    await apiFetchFresh('/menu/categories').catch(() => {});
    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('/api/');
    expect(calledUrl).toBe('https://teashoresite-production.up.railway.app/menu/categories');
  });

  it('T-BASE-5: dev fallback never uses a full URL (stays relative)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.resetModules();
    const { apiFetch: apiFetchFresh } = await import('../lib/api');

    await apiFetchFresh('/qr/scan').catch(() => {});
    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toBe('/api/qr/scan');
    expect(calledUrl).not.toMatch(/^https?:\/\//);
  });
});
