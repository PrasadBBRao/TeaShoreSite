/**
 * Checkout.test.jsx — F6: payment instructions and order-placement behaviour.
 *
 * T-C1:  takeaway shows "Pay at the counter" instructions
 * T-C2:  dine_in  shows "Pay at the counter" instructions
 * T-C3:  delivery shows "Pay on delivery" instructions
 * T-C4:  no old test-payment wording appears for any order type
 * T-C5:  button label is "Place Order" (not a test-payment label)
 * T-C6:  takeaway  → POST /orders with order_type:"takeaway"
 * T-C7:  dine_in   → POST /orders with order_type:"dine_in" and session_token
 * T-C8:  delivery  → POST /orders with order_type:"home_delivery",
 *                    delivery_address, delivery_distance_km
 * T-C9:  API error surfaces as an error toast (apiFetch rejects)
 * T-C10: on success, cart is cleared and page navigates to /orders
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Module mocks ──────────────────────────────────────────────────────────

// Stable auth object — prevents useEffect dependency churn
vi.mock('../context/AuthContext', () => {
  const stableUser = { id: 'u1', name: 'Tester' };
  return {
    useAuth: () => ({ user: stableUser, token: 'tok', loading: false }),
    AuthProvider: ({ children }) => children,
  };
});

// Track clearCart calls and expose controlled cart values
const mockClearCart = vi.fn();
vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    items:     { 'item-1': { id: 'item-1', name: 'Tea', price: 10, qty: 2 } },
    cartTotal: 20,
    cartCount: 2,
    clearCart: mockClearCart,
  }),
}));

// Capture showToast calls
const mockShowToast = vi.fn();
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// apiFetch is the single network seam
vi.mock('../lib/api', () => ({
  apiFetch:    vi.fn(),
  apiFetchRaw: vi.fn(),
}));

import { apiFetch } from '../lib/api';
import Checkout from '../pages/Checkout';

// ── Per-test hygiene ──────────────────────────────────────────────────────

beforeEach(() => {
  apiFetch.mockReset();
  mockClearCart.mockReset();
  mockShowToast.mockReset();
});
afterEach(() => { cleanup(); });

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Shared location.state shapes, mirroring what Cart.jsx passes to Checkout.
 */
const STATES = {
  takeaway: {
    orderType:      'takeaway',
    taxes:          2,
    finalTotal:     22,
    deliveryCharge: 0,
    address:        null,
    distance:       null,
  },
  dine_in: {
    orderType:     'dine_in',
    sessionToken:  'session-abc',
    tableNumber:   3,
    taxes:         2,
    finalTotal:    22,
    deliveryCharge: 0,
  },
  delivery: {
    orderType:      'delivery',
    address:        '12 Main St, Chennai',
    distance:       '3.2',
    deliveryCharge: 30,
    taxes:          2,
    finalTotal:     52,
  },
};

/** Renders Checkout with the given location state inside a MemoryRouter. */
function renderCheckout(locationState) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/checkout', state: locationState }]}
    >
      <Routes>
        <Route path="/checkout" element={<Checkout />} />
        {/* Stub /orders so navigation after success doesn't crash */}
        <Route path="/orders" element={<div data-testid="orders-page">Orders</div>} />
        <Route path="/login"  element={<div data-testid="login-page">Login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ── T-C1 / T-C2: counter payment instructions (takeaway + dine_in) ────────

describe('Payment instructions — counter (takeaway / dine_in)', () => {

  it('T-C1: takeaway shows "Pay at the counter" heading', () => {
    renderCheckout(STATES.takeaway);
    const box = screen.getByTestId('payment-instructions');
    expect(box).toHaveTextContent(/pay at the counter/i);
  });

  it('T-C2: dine_in shows "Pay at the counter" heading', () => {
    renderCheckout(STATES.dine_in);
    const box = screen.getByTestId('payment-instructions');
    expect(box).toHaveTextContent(/pay at the counter/i);
  });

  it('T-C1b: takeaway instructions mention cash or UPI', () => {
    renderCheckout(STATES.takeaway);
    const box = screen.getByTestId('payment-instructions');
    expect(box).toHaveTextContent(/cash or upi/i);
  });

  it('T-C2b: dine_in instructions mention staff confirming payment', () => {
    renderCheckout(STATES.dine_in);
    const box = screen.getByTestId('payment-instructions');
    expect(box).toHaveTextContent(/staff confirm/i);
  });

});

// ── T-C3: delivery payment instructions ───────────────────────────────────

describe('Payment instructions — delivery', () => {

  it('T-C3: delivery shows "Pay on delivery" heading', () => {
    renderCheckout(STATES.delivery);
    const box = screen.getByTestId('payment-instructions');
    expect(box).toHaveTextContent(/pay on delivery/i);
  });

  it('T-C3b: delivery instructions do NOT say "pay at the counter"', () => {
    renderCheckout(STATES.delivery);
    const box = screen.getByTestId('payment-instructions');
    expect(box).not.toHaveTextContent(/pay at the counter/i);
  });

  it('T-C3c: delivery instructions mention delivery agent collecting payment', () => {
    renderCheckout(STATES.delivery);
    const box = screen.getByTestId('payment-instructions');
    expect(box).toHaveTextContent(/delivery agent/i);
  });

});

// ── T-C4: old test-payment wording must be gone ───────────────────────────

describe('Removed test-payment wording', () => {

  const ALL_STATES = Object.values(STATES);

  it('T-C4a: "Test Payment" text does not appear in any order type', () => {
    for (const s of ALL_STATES) {
      const { unmount } = renderCheckout(s);
      expect(document.body).not.toHaveTextContent(/test payment/i);
      unmount();
    }
  });

  it('T-C4b: "No real payment charged" disclaimer is gone', () => {
    for (const s of ALL_STATES) {
      const { unmount } = renderCheckout(s);
      expect(document.body).not.toHaveTextContent(/no real payment charged/i);
      unmount();
    }
  });

  it('T-C4c: "Temporary test flow" disclaimer is gone', () => {
    for (const s of ALL_STATES) {
      const { unmount } = renderCheckout(s);
      expect(document.body).not.toHaveTextContent(/temporary test flow/i);
      unmount();
    }
  });

  it('T-C4d: "Payment will be added in the next step" is gone', () => {
    for (const s of ALL_STATES) {
      const { unmount } = renderCheckout(s);
      expect(document.body).not.toHaveTextContent(/payment will be added in the next step/i);
      unmount();
    }
  });

});

// ── T-C5: button label ────────────────────────────────────────────────────

describe('Place Order button', () => {

  it('T-C5: button is labelled "Place Order" for takeaway', () => {
    renderCheckout(STATES.takeaway);
    expect(screen.getByRole('button', { name: /^place order$/i })).toBeInTheDocument();
  });

  it('T-C5b: button is labelled "Place Order" for dine_in', () => {
    renderCheckout(STATES.dine_in);
    expect(screen.getByRole('button', { name: /^place order$/i })).toBeInTheDocument();
  });

  it('T-C5c: button is labelled "Place Order" for delivery', () => {
    renderCheckout(STATES.delivery);
    expect(screen.getByRole('button', { name: /^place order$/i })).toBeInTheDocument();
  });

});

// ── T-C6 / T-C7 / T-C8: API body correctness ─────────────────────────────

describe('Order-placement API calls', () => {

  it('T-C6: takeaway → POST /orders with order_type:"takeaway"', async () => {
    apiFetch.mockResolvedValueOnce({ order_number: 'TK-100' });
    renderCheckout(STATES.takeaway);

    await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe('/orders');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.order_type).toBe('takeaway');
    expect(body.session_token).toBeUndefined();
    expect(body.delivery_address).toBeUndefined();
    expect(body.items).toEqual([
      { menu_item_id: 'item-1', quantity: 2 },
    ]);
  });

  it('T-C7: dine_in → POST /orders with order_type:"dine_in" and session_token', async () => {
    apiFetch.mockResolvedValueOnce({ order_number: 'TK-101' });
    renderCheckout(STATES.dine_in);

    await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe('/orders');

    const body = JSON.parse(init.body);
    expect(body.order_type).toBe('dine_in');
    expect(body.session_token).toBe('session-abc');
    expect(body.items).toEqual([
      { menu_item_id: 'item-1', quantity: 2 },
    ]);
  });

  it('T-C8: delivery → POST /orders with order_type:"home_delivery", address, distance', async () => {
    apiFetch.mockResolvedValueOnce({ order_number: 'TK-102' });
    renderCheckout(STATES.delivery);

    await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe('/orders');

    const body = JSON.parse(init.body);
    expect(body.order_type).toBe('home_delivery');
    expect(body.delivery_address).toBe('12 Main St, Chennai');
    expect(body.delivery_distance_km).toBe(3.2);
    expect(body.session_token).toBeUndefined();
    expect(body.items).toEqual([
      { menu_item_id: 'item-1', quantity: 2 },
    ]);
  });

});

// ── T-C9: API error ───────────────────────────────────────────────────────

describe('Order-placement error handling', () => {

  it('T-C9: API error shows error toast with the rejection message', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Out of stock.'));
    renderCheckout(STATES.takeaway);

    await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledOnce());

    const [msg, type] = mockShowToast.mock.calls[0];
    expect(msg).toBe('Out of stock.');
    expect(type).toBe('error');
  });

  it('T-C9b: cart is NOT cleared on API error', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Server error'));
    renderCheckout(STATES.takeaway);

    await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(mockClearCart).not.toHaveBeenCalled();
  });

});

// ── T-C10: success flow ───────────────────────────────────────────────────

describe('Order-placement success flow', () => {

  it('T-C10: on success, cart is cleared and page navigates to /orders', async () => {
    apiFetch.mockResolvedValueOnce({ order_number: 'TK-200' });
    renderCheckout(STATES.takeaway);

    await userEvent.click(screen.getByRole('button', { name: /^place order$/i }));

    // Cart cleared
    await waitFor(() => expect(mockClearCart).toHaveBeenCalledOnce());

    // Success toast shown with order number
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('TK-200'),
    );

    // Navigated away to /orders
    await waitFor(() =>
      expect(screen.getByTestId('orders-page')).toBeInTheDocument()
    );
  });

});
