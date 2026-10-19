/**
 * AdminOrders.test.jsx
 *
 * Tests for the payment-confirmation feature added to AdminOrders.
 *
 * T-P1:  Cash confirmation button calls PATCH /admin/orders/{id}/payment
 *        with { payment_method: "cash" }
 * T-P2:  UPI confirmation button calls PATCH /admin/orders/{id}/payment
 *        with { payment_method: "upi" }
 * T-P3:  API error surfaces as an error message in the panel
 * T-P4:  Legacy (fake_paid) orders never show confirmation buttons
 * T-P5:  Already-paid orders never show confirmation buttons
 * T-P6:  Payment filter chip "Unpaid" shows only unpaid orders
 * T-P7:  Payment filter chip "Legacy" shows only fake_paid orders
 * T-P8:  Payment filter chip "Paid" shows only paid orders
 * T-P9:  After successful cash confirmation, panel shows success message
 *        and "Confirm Payment" section disappears
 * T-P10: Both buttons are disabled while a confirmation is in progress
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock('../admin/context/AdminAuthContext', () => ({
  useAdminAuth: vi.fn(() => ({ token: 'admin-token-abc' })),
}));

// We intercept the global fetch so we can control every /api call
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── Import AFTER mocks are registered ─────────────────────────────────────
import AdminOrders from '../admin/pages/AdminOrders';

// ── Helpers ───────────────────────────────────────────────────────────────

function mockJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

/**
 * Build a minimal order object for seeding the list response.
 * payment_status defaults to "unpaid" for most tests.
 */
function makeOrder(overrides = {}) {
  return {
    id:                 overrides.id         ?? 'order-uuid-1',
    order_number:       overrides.order_number ?? 'T-1001',
    order_type:         overrides.order_type   ?? 'dine_in',
    status:             overrides.status        ?? 'placed',
    payment_status:     overrides.payment_status ?? 'unpaid',
    payment_method:     overrides.payment_method ?? null,
    total_price:        '10.00',
    daily_token_number: null,
    delivery_address:   null,
    delivery_distance_km: null,
    delivery_charge:    null,
    items_total:        '10.00',
    user_id:            'user-uuid-1',
    session_id:         'sess-uuid-1',
    created_at:         '2025-10-17T10:00:00Z',
    updated_at:         '2025-10-17T10:00:00Z',
    items:              [],
    ...overrides,
  };
}

/**
 * Seed fetch mock:
 *   1st call  → GET /admin/orders (list)
 *   2nd call  → GET /admin/orders/{id} (detail on row click)
 *   Subsequent calls → passed as extra handlers in order
 */
function seedFetch(listOrders, detailOrder, ...extraResponses) {
  const allResponses = [
    mockJsonResponse(200, listOrders),
    mockJsonResponse(200, detailOrder),
    ...extraResponses,
  ];
  let callIndex = 0;
  fetch.mockImplementation(() => {
    const resp = allResponses[callIndex] ?? allResponses[allResponses.length - 1];
    callIndex++;
    return Promise.resolve(resp);
  });
}

function renderAdminOrders() {
  return render(<AdminOrders />);
}

// ══════════════════════════════════════════════════════════════════════════
//  PAYMENT CONFIRMATION BUTTONS
// ══════════════════════════════════════════════════════════════════════════

describe('Payment confirmation — unpaid orders', () => {

  it('T-P1: Cash button calls PATCH /payment with { payment_method: "cash" }', async () => {
    const order = makeOrder();
    const confirmedOrder = { ...order, payment_status: 'paid', payment_method: 'cash' };

    seedFetch([order], order, mockJsonResponse(200, confirmedOrder));

    renderAdminOrders();

    // Click the row to open the detail panel
    await waitFor(() => screen.getByText('T-1001'));
    await userEvent.click(screen.getByText('T-1001'));

    // Wait for detail panel to load
    await waitFor(() => screen.getByText('Confirm Payment'));

    // Click Cash
    await userEvent.click(screen.getByRole('button', { name: /confirm cash payment/i }));

    await waitFor(() => {
      const calls = fetch.mock.calls;
      const patchCall = calls.find(c =>
        c[0].includes('/payment') && c[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.payment_method).toBe('cash');
    });
  });

  it('T-P2: UPI button calls PATCH /payment with { payment_method: "upi" }', async () => {
    const order = makeOrder();
    const confirmedOrder = { ...order, payment_status: 'paid', payment_method: 'upi' };

    seedFetch([order], order, mockJsonResponse(200, confirmedOrder));

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-1001'));
    await userEvent.click(screen.getByText('T-1001'));
    await waitFor(() => screen.getByText('Confirm Payment'));

    await userEvent.click(screen.getByRole('button', { name: /confirm upi payment/i }));

    await waitFor(() => {
      const patchCall = fetch.mock.calls.find(c =>
        c[0].includes('/payment') && c[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.payment_method).toBe('upi');
    });
  });

  it('T-P3: API error shows error message in the panel', async () => {
    const order = makeOrder();

    seedFetch(
      [order],
      order,
      mockJsonResponse(400, { detail: 'Order is not unpaid.' }),
    );

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-1001'));
    await userEvent.click(screen.getByText('T-1001'));
    await waitFor(() => screen.getByText('Confirm Payment'));

    await userEvent.click(screen.getByRole('button', { name: /confirm cash payment/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Order is not unpaid.');
    });
  });

  it('T-P9: Success hides the Confirm Payment section and shows success message', async () => {
    const order = makeOrder();
    const confirmedOrder = { ...order, payment_status: 'paid', payment_method: 'cash' };

    seedFetch([order], order, mockJsonResponse(200, confirmedOrder));

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-1001'));
    await userEvent.click(screen.getByText('T-1001'));
    await waitFor(() => screen.getByText('Confirm Payment'));

    await userEvent.click(screen.getByRole('button', { name: /confirm cash payment/i }));

    await waitFor(() => {
      expect(screen.getByText('Cash payment confirmed.')).toBeInTheDocument();
    });

    // Confirm Payment section should no longer be visible (order is now paid)
    expect(screen.queryByText('Confirm Payment')).not.toBeInTheDocument();
  });

  it('T-P10: Both buttons are disabled while confirmation is in progress', async () => {
    const order = makeOrder();

    // Make the PATCH hang so we can check the disabled state
    let resolvePatch;
    const patchPromise = new Promise(resolve => { resolvePatch = resolve; });

    let callCount = 0;
    fetch.mockImplementation((url) => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockJsonResponse(200, [order]));
      if (callCount === 2) return Promise.resolve(mockJsonResponse(200, order));
      return patchPromise; // PATCH hangs
    });

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-1001'));
    await userEvent.click(screen.getByText('T-1001'));
    await waitFor(() => screen.getByText('Confirm Payment'));

    const cashBtn = screen.getByRole('button', { name: /confirm cash payment/i });
    const upiBtn  = screen.getByRole('button', { name: /confirm upi payment/i });

    // Trigger but don't await so the request stays in-flight
    userEvent.click(cashBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm cash payment/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /confirm upi payment/i })).toBeDisabled();
    });

    // Resolve to clean up
    resolvePatch(mockJsonResponse(200, { ...order, payment_status: 'paid', payment_method: 'cash' }));
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  LEGACY AND PAID ORDERS — no confirmation buttons
// ══════════════════════════════════════════════════════════════════════════

describe('Payment confirmation — restricted statuses', () => {

  it('T-P4: fake_paid (legacy) orders do not show confirmation buttons', async () => {
    const order = makeOrder({ payment_status: 'fake_paid' });

    seedFetch([order], order);

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-1001'));
    await userEvent.click(screen.getByText('T-1001'));

    // Wait for detail to render (check that Payment section is visible)
    await waitFor(() => screen.getByText('Legacy (unverified)'));

    expect(screen.queryByText('Confirm Payment')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm cash payment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm upi payment/i })).not.toBeInTheDocument();
  });

  it('T-P5: already-paid orders do not show confirmation buttons', async () => {
    const order = makeOrder({ payment_status: 'paid', payment_method: 'cash' });

    seedFetch([order], order);

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-1001'));
    await userEvent.click(screen.getByText('T-1001'));

    await waitFor(() => screen.getByText('Cash'));   // "Method: Cash" row in Payment section

    expect(screen.queryByText('Confirm Payment')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm cash payment/i })).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  PAYMENT FILTER CHIPS
// ══════════════════════════════════════════════════════════════════════════

describe('Payment filter chips', () => {

  it('T-P6: "Unpaid" filter shows only unpaid orders', async () => {
    const orders = [
      makeOrder({ id: 'o1', order_number: 'T-2001', payment_status: 'unpaid'    }),
      makeOrder({ id: 'o2', order_number: 'T-2002', payment_status: 'paid'       }),
      makeOrder({ id: 'o3', order_number: 'T-2003', payment_status: 'fake_paid'  }),
    ];

    fetch.mockResolvedValue(mockJsonResponse(200, orders));

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-2001'));

    // All three visible initially
    expect(screen.getByText('T-2001')).toBeInTheDocument();
    expect(screen.getByText('T-2002')).toBeInTheDocument();
    expect(screen.getByText('T-2003')).toBeInTheDocument();

    // The payment filter row has: All Payments | Unpaid | Paid | Legacy
    // Find the Unpaid chip by aria-pressed + text
    const unpaidChips = screen.getAllByRole('button', { pressed: false }).filter(
      btn => btn.textContent.trim().startsWith('Unpaid')
    );
    await userEvent.click(unpaidChips[0]);

    await waitFor(() => {
      expect(screen.getByText('T-2001')).toBeInTheDocument();
      expect(screen.queryByText('T-2002')).not.toBeInTheDocument();
      expect(screen.queryByText('T-2003')).not.toBeInTheDocument();
    });
  });

  it('T-P7: "Legacy" filter shows only fake_paid orders', async () => {
    const orders = [
      makeOrder({ id: 'o1', order_number: 'T-3001', payment_status: 'unpaid'   }),
      makeOrder({ id: 'o2', order_number: 'T-3002', payment_status: 'fake_paid' }),
      makeOrder({ id: 'o3', order_number: 'T-3003', payment_status: 'paid'      }),
    ];

    fetch.mockResolvedValue(mockJsonResponse(200, orders));

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-3001'));

    const legacyChips = screen.getAllByRole('button', { pressed: false }).filter(
      btn => btn.textContent.trim().startsWith('Legacy')
    );
    await userEvent.click(legacyChips[0]);

    await waitFor(() => {
      expect(screen.queryByText('T-3001')).not.toBeInTheDocument();
      expect(screen.getByText('T-3002')).toBeInTheDocument();
      expect(screen.queryByText('T-3003')).not.toBeInTheDocument();
    });
  });

  it('T-P8: "Paid" filter shows only paid orders', async () => {
    const orders = [
      makeOrder({ id: 'o1', order_number: 'T-4001', payment_status: 'unpaid'   }),
      makeOrder({ id: 'o2', order_number: 'T-4002', payment_status: 'paid',
                  payment_method: 'cash'                                          }),
      makeOrder({ id: 'o3', order_number: 'T-4003', payment_status: 'fake_paid' }),
    ];

    fetch.mockResolvedValue(mockJsonResponse(200, orders));

    renderAdminOrders();

    await waitFor(() => screen.getByText('T-4001'));

    // "Paid" appears as a filter chip and also as a count badge; target the button
    const paidChips = screen.getAllByRole('button', { pressed: false }).filter(
      btn => btn.textContent.trim().startsWith('Paid')
    );
    await userEvent.click(paidChips[0]);

    await waitFor(() => {
      expect(screen.queryByText('T-4001')).not.toBeInTheDocument();
      expect(screen.getByText('T-4002')).toBeInTheDocument();
      expect(screen.queryByText('T-4003')).not.toBeInTheDocument();
    });
  });
});
