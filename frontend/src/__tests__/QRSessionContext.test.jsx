/**
 * QRSessionContext.test.jsx
 *
 * T4: setSession stores sessionToken in sessionStorage (not localStorage)
 * T4b: clearSession removes from sessionStorage
 * T4c: session is hydrated from sessionStorage on mount (survives refresh)
 * T8: localStorage is never touched by QRSessionContext
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QRSessionProvider, useQRSession } from '../context/QRSessionContext';

const SESSION_KEY = 'teashore_qr_session';

const SAMPLE_SESSION = {
  sessionId:    'sess-uuid-1',
  sessionToken: 'tok_abc123secret',
  tableId:      'table-uuid-1',
  tableNumber:  2,
};

// Helper component that calls context methods and exposes them via data-testid
function Harness({ onMount }) {
  const ctx = useQRSession();
  // Call onMount with the context so tests can interact with it
  if (onMount) onMount(ctx);
  return (
    <div data-testid="session">
      {ctx.session ? JSON.stringify(ctx.session) : 'null'}
    </div>
  );
}

function renderWithProvider(onMount) {
  return render(
    <QRSessionProvider>
      <Harness onMount={onMount} />
    </QRSessionProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('QRSessionContext', () => {
  it('T4: setSession writes to sessionStorage, not localStorage', () => {
    let ctx;
    renderWithProvider((c) => { ctx = c; });

    act(() => { ctx.setSession(SAMPLE_SESSION); });

    // sessionStorage must have the value
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    expect(stored).not.toBeNull();
    expect(stored.sessionToken).toBe('tok_abc123secret');
    expect(stored.tableNumber).toBe(2);

    // localStorage must be untouched
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('T4b: clearSession removes from sessionStorage', () => {
    let ctx;
    renderWithProvider((c) => { ctx = c; });

    act(() => { ctx.setSession(SAMPLE_SESSION); });
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();

    act(() => { ctx.clearSession(); });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('T4c: context hydrates from sessionStorage on mount', () => {
    // Pre-populate sessionStorage as if the user refreshed mid-session
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(SAMPLE_SESSION));

    const { getByTestId } = renderWithProvider();
    const text = getByTestId('session').textContent;
    const parsed = JSON.parse(text);

    expect(parsed.sessionToken).toBe('tok_abc123secret');
    expect(parsed.tableNumber).toBe(2);
  });

  it('T8: localStorage is never read or written by this context', () => {
    let ctx;
    renderWithProvider((c) => { ctx = c; });

    act(() => { ctx.setSession(SAMPLE_SESSION); });
    act(() => { ctx.clearSession(); });

    // No QR-related keys in localStorage at any point
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('starts with null session when sessionStorage is empty', () => {
    const { getByTestId } = renderWithProvider();
    expect(getByTestId('session').textContent).toBe('null');
  });
});
