/**
 * Checkout.jsx — Review and place an order.
 *
 * Handles three order types passed via React Router location.state:
 *
 *   dine_in       state: { orderType:"dine_in", sessionToken, tableNumber,
 *                          taxes, finalTotal, deliveryCharge:0 }
 *                 → sends { order_type:"dine_in", session_token, items }
 *                 → sessionToken comes from QRSessionContext via Cart,
 *                   lives in location.state (not URL, not localStorage)
 *
 *   takeaway      state: { orderType:"takeaway", taxes, finalTotal,
 *                          deliveryCharge:0, address:null, distance:null }
 *                 → sends { order_type:"takeaway", items }
 *
 *   delivery      state: { orderType:"delivery", address, distance,
 *                          deliveryCharge, taxes, finalTotal }
 *                 → sends { order_type:"home_delivery", delivery_address,
 *                           delivery_distance_km, items }
 *
 * Payment flow: orders are placed first, then paid in person.
 *   dine_in / takeaway — customer pays at the counter (cash or UPI).
 *   delivery           — customer pays the delivery agent on arrival (cash or UPI).
 *   In all cases, staff confirm receipt of payment in the admin panel.
 */

import { ArrowLeft, Check, LockKeyhole, MapPin, UtensilsCrossed } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useCart }  from "../context/CartContext";
import { useAuth }  from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";

function money(value) {
  return `₹${Number(value || 0).toFixed(2).replace(/\.00$/, "")}`;
}

export default function Checkout() {
  const navigate          = useNavigate();
  const { state }         = useLocation();
  const { items, cartTotal, cartCount, clearCart } = useCart();
  const { token }         = useAuth();
  const { showToast }     = useToast();

  const orderType     = state?.orderType ?? null;
  const isDineIn      = orderType === "dine_in";
  const isDelivery    = orderType === "delivery";
  const sessionToken  = state?.sessionToken ?? null;   // only present for dine_in
  const tableNumber   = state?.tableNumber  ?? null;

  const addressReady  = state?.address && state?.distance;
  const [placing, setPlacing] = useState(false);

  /* ── Guard: need a valid order type and at least one item ── */
  if (!orderType || cartCount === 0) {
    const backTo = isDineIn ? "/cart" : "/cart";
    return (
      <main className="min-h-screen bg-cream px-6 pb-24 pt-28">
        <div className="mx-auto max-w-xl rounded-[2rem] border border-cream-dark bg-cream-light p-10 text-center shadow-card">
          <h1 className="font-serif text-3xl font-semibold text-palm-brown">Checkout is waiting</h1>
          <p className="mt-3 font-sans text-sm text-palm-brown/60">
            Complete your cart and select an order type first.
          </p>
          <button
            onClick={() => navigate(backTo)}
            className="mt-7 rounded-full bg-palm-brown px-6 py-3 font-sans text-sm font-semibold text-cream"
          >
            Return to Cart
          </button>
        </div>
      </main>
    );
  }

  /* ── Additional guard for dine_in: session token must be present ── */
  if (isDineIn && !sessionToken) {
    return (
      <main className="min-h-screen bg-cream px-6 pb-24 pt-28">
        <div className="mx-auto max-w-xl rounded-[2rem] border border-amber-200 bg-amber-50 p-10 text-center shadow-card">
          <h1 className="font-serif text-2xl font-semibold text-palm-brown">Session expired</h1>
          <p className="mt-3 font-sans text-sm text-palm-brown/70">
            Your table session has expired. Please scan the table QR code again.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-7 rounded-full bg-palm-brown px-6 py-3 font-sans text-sm font-semibold text-cream"
          >
            Go back
          </button>
        </div>
      </main>
    );
  }

  /* ── Place order ─────────────────────────────────────────────────────
     Creates a real order in the backend with payment_status = "unpaid".
     Staff confirm payment (cash or UPI) via the admin panel after
     receiving it from the customer.
  ──────────────────────────────────────────────────────────────────────── */
  async function handlePlaceOrder() {
    if (!token) { navigate("/login"); return; }
    setPlacing(true);
    try {
      const cartRows = Object.values(items);

      /* Build the request body based on order type */
      let body;
      if (isDineIn) {
        body = {
          order_type:    "dine_in",
          session_token: sessionToken,   // required by backend for dine_in
          items: cartRows.map((e) => ({ menu_item_id: e.id, quantity: e.qty })),
        };
      } else if (isDelivery) {
        body = {
          order_type:           "home_delivery",
          delivery_address:     state.address,
          delivery_distance_km: Number(state.distance),
          items: cartRows.map((e) => ({ menu_item_id: e.id, quantity: e.qty })),
        };
      } else {
        // takeaway
        body = {
          order_type: "takeaway",
          items: cartRows.map((e) => ({ menu_item_id: e.id, quantity: e.qty })),
        };
      }

      const order = await apiFetch("/orders", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });

      clearCart();
      showToast(`Order placed · ${order.order_number}`);
      navigate("/orders", { replace: true });
    } catch (err) {
      showToast(err.message || "Order failed. Please try again.", "error");
    } finally {
      setPlacing(false);
    }
  }
  /* ── END PLACE ORDER ───────────────────────────────────────────────── */

  /* ── Order-type label for the UI ── */
  const orderLabel = isDineIn
    ? `Dine In · Table ${tableNumber}`
    : isDelivery
      ? "Delivery details"
      : "Takeaway";

  const orderSub = isDineIn
    ? `${cartCount} item${cartCount !== 1 ? "s" : ""} · served at your table`
    : isDelivery
      ? `${cartCount} item${cartCount !== 1 ? "s" : ""} · ${state.distance} km route`
      : `${cartCount} item${cartCount !== 1 ? "s" : ""} · pick up at counter`;

  return (
    <main className="min-h-screen bg-cream px-4 pb-24 pt-8 sm:px-6 md:pt-12">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => navigate("/cart")}
          className="mb-8 flex items-center gap-2 font-sans text-sm font-semibold text-palm-brown/65 hover:text-palm-brown"
        >
          <ArrowLeft className="h-4 w-4" /> Back to cart
        </button>

        <p className="font-sans text-xs font-semibold uppercase tracking-[0.24em] text-amber-accent">
          One last look
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-palm-brown sm:text-5xl">
          Proceed to Checkout
        </h1>
        <p className="mt-3 font-sans text-sm text-palm-brown/60">
          Review your order, then place it. You pay in person — cash or UPI.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_0.8fr]">

          {/* ── Left: order details ── */}
          <section className="rounded-[2rem] border border-cream-dark bg-cream-light p-6 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-700">
                {isDineIn
                  ? <UtensilsCrossed className="h-5 w-5" />
                  : <Check className="h-5 w-5" />
                }
              </span>
              <div>
                <h2 className="font-serif text-xl font-semibold text-palm-brown">{orderLabel}</h2>
                <p className="font-sans text-xs text-palm-brown/55">{orderSub}</p>
              </div>
            </div>

            {/* Delivery address */}
            {isDelivery && (
              <div className="mt-6 flex gap-3 rounded-2xl bg-cream px-4 py-4">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-palm-brown" />
                <p className="font-sans text-sm leading-relaxed text-palm-brown">{state.address}</p>
              </div>
            )}

            {/* Payment instructions — accurate per order type */}
            {isDelivery ? (
              <div
                data-testid="payment-instructions"
                className="mt-5 flex flex-col gap-2 rounded-2xl border border-amber-accent/30
                           bg-amber-accent/10 px-4 py-3 font-sans text-sm text-palm-brown"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <LockKeyhole className="h-4 w-4 shrink-0" />
                  Pay on delivery — cash or UPI
                </div>
                <p className="text-xs text-palm-brown/65 leading-relaxed">
                  Place your order now. Our delivery agent will collect payment
                  when your order arrives. Staff confirm receipt in the system.
                </p>
              </div>
            ) : (
              <div
                data-testid="payment-instructions"
                className="mt-5 flex flex-col gap-2 rounded-2xl border border-amber-accent/30
                           bg-amber-accent/10 px-4 py-3 font-sans text-sm text-palm-brown"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <LockKeyhole className="h-4 w-4 shrink-0" />
                  Pay at the counter — cash or UPI
                </div>
                <p className="text-xs text-palm-brown/65 leading-relaxed">
                  Place your order now and pay at the counter when you collect
                  or are served. Staff confirm your payment after receiving it.
                </p>
              </div>
            )}

            <button
              onClick={handlePlaceOrder}
              disabled={placing}
              className="mt-4 w-full rounded-full bg-palm-brown px-5 py-3
                         font-sans text-sm font-semibold text-cream
                         hover:bg-amber-accent
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors duration-150"
            >
              {placing ? "Placing your order…" : "Place Order"}
            </button>
          </section>

          {/* ── Right: bill summary ── */}
          <section className="h-fit rounded-[2rem] border border-cream-dark bg-cream-light p-6 shadow-card">
            <h2 className="font-serif text-xl font-semibold text-palm-brown">Order total</h2>
            <div className="mt-5 space-y-3 font-sans text-sm text-palm-brown/70">
              <div className="flex justify-between">
                <span>Items</span>
                <span>{money(cartTotal)}</span>
              </div>
              {!isDineIn && (
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>{money(state?.deliveryCharge ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Taxes / Charges</span>
                <span>{money(state?.taxes ?? 0)}</span>
              </div>
              <div className="mt-4 flex justify-between border-t border-cream-dark pt-4
                              text-base font-bold text-palm-brown">
                <span>Final Total</span>
                <span>{money(state?.finalTotal ?? cartTotal)}</span>
              </div>
            </div>
            <button
              onClick={() => navigate("/cart")}
              className="mt-7 w-full rounded-full border border-palm-brown px-5 py-3
                         font-sans text-sm font-semibold text-palm-brown hover:bg-cream"
            >
              Edit Cart
            </button>
          </section>

        </div>
      </div>
    </main>
  );
}
