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
