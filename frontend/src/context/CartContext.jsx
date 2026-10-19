/**
 * CartContext.jsx — Global cart state for Teashore.
 *
 * Storage : localStorage key "teashore_cart"
 * Shape   : { [itemId]: { id, name, price (number), qty } }
 *
 * Exports:
 *   CartProvider
 *   useCart() → { items, cartCount, cartTotal, addItem, updateQty, removeItem, clearCart }
 *
 * addItem(item)          — item: { id, name, price (string|number), is_available }
 *                          adds 1; or increments if already present.
 * updateQty(id, qty)     — sets qty; if qty < 1 removes the item.
 * removeItem(id)         — removes an item entirely.
 * clearCart()            — empties the cart.
 * cartCount              — total number of individual units.
 * cartTotal              — total price (number, 2 dp).
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const CART_KEY = "teashore_cart";

const CartContext = createContext(null);

/* ── helpers ─────────────────────────────────────────────────────────── */
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // ignore storage errors (private browsing quota, etc.)
  }
}

function toNumber(price) {
  const n = typeof price === "number" ? price : parseFloat(price);
  return isNaN(n) ? 0 : n;
}

/* ── provider ────────────────────────────────────────────────────────── */
export function CartProvider({ children }) {
  const [items, setItems] = useState(() => loadCart());

  // Sync to localStorage on every change
  useEffect(() => { saveCart(items); }, [items]);

  const addItem = useCallback((item) => {
    setItems((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          id:    item.id,
          name:  item.name,
          price: toNumber(item.price),
          image_url: item.image_url || existing?.image_url || null,
          category: item.category || existing?.category || "",
          qty:   existing ? existing.qty + 1 : 1,
        },
      };
    });
  }, []);

  const updateQty = useCallback((id, qty) => {
    if (qty < 1) {
      setItems((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      setItems((prev) => ({
        ...prev,
        [id]: { ...prev[id], qty },
      }));
    }
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearCart = useCallback(() => setItems({}), []);

  const cartCount = Object.values(items).reduce((sum, i) => sum + i.qty, 0);
  const cartTotal = Object.values(items).reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, cartCount, cartTotal, addItem, updateQty, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
