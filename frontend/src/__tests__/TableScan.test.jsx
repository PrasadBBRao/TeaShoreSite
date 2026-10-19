/**
 * TableScan.test.jsx
 *
 * T1:  calls POST /qr/scan with the qrSecret from the URL param
 * T2:  on 409 shows "table in use" message, no token in sessionStorage
 * T3:  on 404 shows "invalid QR" message
 * T4:  on success stores session in sessionStorage (not localStorage)
 * T4b: session token does NOT appear in the URL after successful scan
 * T2b: 409 response page text never contains the word "token"
 * T10: network error shows retry button which triggers a second scan attempt
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TableScan from '../pages/TableScan';
import { QRSessionProvider } from '../context/QRSessionContext';

const SESSION_KEY = 'teashore_qr_session';

// Mock the entire AuthContext module so useAuth() returns a controlled value
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ token: null, user: null, loading: false })),
  AuthProvider: ({ children }) => children,
}));

// Mock apiFetchRaw so tests never hit the network
vi.mock('../lib/api', () => ({
  apiFetch:    vi.fn(),
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '../lib/api';

function renderTableScan(qrSecret = 'TEST-SECRET') {
  return render(
    <QRSessionProvider>
      <MemoryRouter initialEntries={[`/table/${qrSecret}`]}>
        <Routes>
          <Route path="/table/:qrSecret" element={<TableScan />} />
          <Route path="/table/menu"      element={<div data-testid="menu-page">Menu</div>} />
        </Routes>
      </MemoryRouter>
    </QRSessionProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TableScan', () => {

  it('T1: calls POST /qr/scan with the correct qr_secret from URL', async () => {
    apiFetchRaw.mockResolvedValue({ ok: false, status: 404, body: {} });

    renderTableScan('MY-TABLE-QR');

    await waitFor(() => {
      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/qr/scan',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ qr_secret: 'MY-TABLE-QR' }),
        })
      );
    });
  });

  it('T2: on 409 shows table-in-use message; no token stored anywhere', async () => {
    apiFetchRaw.mockResolvedValue({
      ok: false,
      status: 409,
      body: {
        detail: { table_in_use: true, table_number: 3, message: 'Table 3 in use.' },
      },
    });

    renderTableScan('BUSY-TABLE');

    await waitFor(() => {
      expect(screen.getByText(/table 3 is currently in use/i)).toBeInTheDocument();
    });

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('T2b: 409 page text never exposes the word "token"', async () => {
    apiFetchRaw.mockResolvedValue({
      ok: false,
      status: 409,
      body: { detail: { table_in_use: true, table_number: 1, message: 'In use.' } },
    });

    renderTableScan('BUSY');

    await waitFor(() => {
      expect(screen.getByText(/currently in use/i)).toBeInTheDocument();
    });

    expect(document.body.textContent.toLowerCase()).not.toContain('token');
  });

  it('T3: on 404 shows invalid QR message', async () => {
    apiFetchRaw.mockResolvedValue({ ok: false, status: 404, body: {} });

    renderTableScan('BAD-SECRET');

    await waitFor(() => {
      expect(screen.getByText(/qr code not recognised/i)).toBeInTheDocument();
    });
  });

  it('T4: on success stores session in sessionStorage, not localStorage', async () => {
    apiFetchRaw.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        session_id: 'sess-111', session_token: 'super-secret-token-abc',
        table_id: 'tbl-222', table_number: 1, is_new_session: true,
      },
    });

    renderTableScan('GOOD-SECRET');

    await waitFor(() => {
      expect(screen.getByTestId('menu-page')).toBeInTheDocument();
    });

    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    expect(stored).not.toBeNull();
    expect(stored.sessionToken).toBe('super-secret-token-abc');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('T4b: session token does not appear in any URL after scan', async () => {
    apiFetchRaw.mockResolvedValue({
      ok: true, status: 200,
      body: {
        session_id: 's1', session_token: 'SECRET-TOKEN-XYZ',
        table_id: 't1', table_number: 2, is_new_session: true,
      },
    });

    renderTableScan('GOOD');

    await waitFor(() => {
      expect(screen.getByTestId('menu-page')).toBeInTheDocument();
    });

    expect(window.location.pathname + window.location.search)
      .not.toContain('SECRET-TOKEN-XYZ');
  });

  it('T10: network error shows retry button; clicking it triggers a second scan', async () => {
    apiFetchRaw
      .mockResolvedValueOnce({ ok: false, status: 0, body: null })   // first: fail
      .mockResolvedValueOnce({ ok: false, status: 404, body: {} });  // after retry

    renderTableScan('NET-TEST');

    await waitFor(() => {
      expect(screen.getByText(/connection error/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(apiFetchRaw).toHaveBeenCalledTimes(2);
    });
  });

});
