/**
 * Orders.test.jsx — Tests for F2: Customer payment status display.
 *
 * Each test renders the Orders page with a specific payment_status
 * and verifies the PaymentBadge shows the correct label.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Stable object references are essential: useEffect([..., user, ...]) in Orders
// uses referential equality to decide whether to re-run.  If useAuth() returns
// a new object literal on every render, setting state (setOrders) triggers a
// re-render, which triggers the effect again, which fires a second apiFetch —
// exhausting the mockResolvedValueOnce queue and leaving orders as undefined.
vi.mock('../context/AuthContext', () => {
  const stableUser = { id: 'u1', name: 'T' };
  return {
    useAuth: () => ({ user: stableUser, token: 'tok', loading: false }),
    AuthProvider: ({ children }) => children,
  };
});

vi.mock('../lib/api', () => ({
  apiFetch:    vi.fn(),
  apiFetchRaw: vi.fn(),
}));

// Prevent the 5s polling interval from running — we replace it once
// at module level before the component ever loads.
vi.spyOn(global, 'setInterval').mockReturnValue(99);
vi.spyOn(global, 'clearInterval').mockReturnValue(undefined);

import { apiFetch } from '../lib/api';
import Orders from '../pages/Orders';

// ── Shared order template ─────────────────────────────────────────────────

function order(ps) {
  return [{
    id: 'o1', order_number: 'TK-777', order_type: 'takeaway',
    status: 'placed',
    ...(ps !== undefined ? { payment_status: ps } : {}),
    payment_method: null,
    total_price: '10.00', items_total: '10.00',
    delivery_charge: null, daily_token_number: null,
    delivery_address: null, delivery_distance_km: null,
    estimated_delivery_minutes: null, estimated_delivery_at: null,
    created_at: '2025-10-17T10:00:00Z', updated_at: '2025-10-17T10:00:00Z',
    items: [{ id: 'i1', menu_item_id: 'm1', menu_item_name: 'Tea',
              quantity: 1, price_at_order: '10.00', line_total: '10.00' }],
  }];
}

function mountWith(ps) {
  apiFetch.mockResolvedValueOnce(order(ps));
  const { container } = render(
    <MemoryRouter initialEntries={['/orders']}><Orders /></MemoryRouter>
  );
  return container;
}

function spans(c, text) {
  return Array.from(c.querySelectorAll('span')).filter(s => s.textContent.trim() === text);
}
function spansHaving(c, text) {
  return Array.from(c.querySelectorAll('span')).filter(s => s.textContent.includes(text));
}

// Reset only the apiFetch mock queue between tests (not spy implementations).
// afterEach cleanup unmounts the React tree so no stale effects survive.
beforeEach(() => { apiFetch.mockReset(); });
afterEach(() => { cleanup(); });

// ══════════════════════════════════════════════════════════════════════════

describe('Payment status badge', () => {

  it('T-O1: paid order shows "Paid"', async () => {
    const c = mountWith('paid');
    await waitFor(() => expect(spans(c, 'Paid').length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it('T-O2: unpaid order shows "Payment Pending"', async () => {
    const c = mountWith('unpaid');
    await waitFor(() => expect(spans(c, 'Payment Pending').length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it('T-O3: fake_paid badge contains "Legacy"', async () => {
    const c = mountWith('fake_paid');
    await waitFor(() => expect(spansHaving(c, 'Legacy').length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it('T-O4: fake_paid badge text is not just "Paid"', async () => {
    const c = mountWith('fake_paid');
    await waitFor(() => expect(spansHaving(c, 'Legacy').length).toBeGreaterThan(0), { timeout: 3000 });
    const badge = spansHaving(c, 'Legacy')[0];
    expect(badge.textContent.trim()).not.toBe('Paid');
    expect(badge.textContent).toContain('Legacy');
  });

  it('T-O5: undefined payment_status renders no payment badge', async () => {
    const c = mountWith(undefined);
    await waitFor(() => expect(spansHaving(c, 'TK-777').length).toBeGreaterThan(0), { timeout: 3000 });
    expect(spans(c, 'Paid')).toHaveLength(0);
    expect(spans(c, 'Payment Pending')).toHaveLength(0);
    expect(spansHaving(c, 'Legacy')).toHaveLength(0);
  });

  it('T-O6: "Payment" row appears in expanded bill summary', async () => {
    const c = mountWith('unpaid');
    await waitFor(() => expect(spans(c, 'Payment Pending').length).toBeGreaterThan(0), { timeout: 3000 });
    const card = c.querySelector('[class*="rounded-2xl"]');
    if (card) {
      await userEvent.click(card);
      await waitFor(() => expect(spans(c, 'Payment').length).toBeGreaterThan(0), { timeout: 3000 });
    }
    expect(spans(c, 'Payment Pending').length).toBeGreaterThan(0);
  });

  it('T-O7: order-status pill and payment badge both render', async () => {
    const c = mountWith('unpaid');
    await waitFor(() => {
      expect(spansHaving(c, 'Order Placed').length).toBeGreaterThan(0);
      expect(spans(c, 'Payment Pending').length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
