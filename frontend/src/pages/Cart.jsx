import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, Minus, Plus, ShoppingCart, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useQRSession } from "../context/QRSessionContext";

const fallbackImages = {
  Makhana: "/makhana.svg",
  Churmuri: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop",
  "Roasted Chickpeas": "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=600&q=80&auto=format&fit=crop",
  "Hummus & Veggie Sticks": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80&auto=format&fit=crop",
  Popcorn: "https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=600&q=80&auto=format&fit=crop",
  "Sprout Chaat": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80&auto=format&fit=crop",
};

const RECOMMENDATIONS = [
  { name: "Makhana", price: 35, category: "Healthy Veg" },
  { name: "Churmuri", price: 30, category: "Healthy Veg" },
  { name: "Roasted Chickpeas", price: 40, category: "Healthy Veg" },
  { name: "Hummus & Veggie Sticks", price: 45, category: "Healthy Veg" },
  { name: "Popcorn", price: 35, category: "Healthy Veg" },
  { name: "Sprout Chaat", price: 40, category: "Healthy Veg" },
];

function money(value) {
  return `₹${Number(value || 0).toFixed(2).replace(/\.00$/, "")}`;
}

function getEta(distance, quantity) {
  const base = distance <= 4 ? 20 : distance <= 5 ? 30 : distance <= 7 ? 35 : 45;
  const adjustment = quantity <= 2 ? 0 : quantity <= 4 ? 5 : quantity <= 6 ? 10 : 15;
  return base + adjustment;
}

function getCharge(zones, distance) {
  const zone = zones.find((entry) => distance >= Number(entry.min_distance_km) && distance < Number(entry.max_distance_km))
    || zones.find((entry) => distance >= Number(entry.min_distance_km) && distance <= Number(entry.max_distance_km));
  return zone ? Number(zone.charge) : 0;
}

function ItemRow({ item, onUpdate, onRemove }) {
  return (
    /* Card layout: image banner on top, info + controls below */
    <div className="overflow-hidden rounded-[1.5rem] border border-cream-dark bg-cream-light shadow-card">

      {/* Food image — full-width landscape banner */}
      <div className="relative h-36 w-full overflow-hidden bg-cream-dark sm:h-40">
        {item.image_url
          ? <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          : <div className="flex h-full w-full items-center justify-center">
              <ShoppingBag className="h-10 w-10 text-palm-brown/20" />
            </div>
        }
      </div>

      {/* Info row below image */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">

        {/* Name + price */}
        <div className="min-w-0 flex-1">
          <h3 className="font-anton uppercase text-base tracking-wide text-palm-brown leading-tight truncate">
            {item.name}
          </h3>
          <p className="mt-0.5 font-poppins text-sm font-bold text-amber-accent-dark">
            {money(item.price)}
          </p>
        </div>

        {/* Qty stepper + line total */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1 rounded-full bg-palm-brown px-1.5 py-1">
            <button
              onClick={() => onUpdate(item.id, item.qty - 1)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-cream hover:bg-palm-brown-light transition-colors"
              aria-label={`Decrease ${item.name}`}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center font-poppins text-sm font-bold text-cream tabular-nums">
              {item.qty}
            </span>
            <button
              onClick={() => onUpdate(item.id, item.qty + 1)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-cream hover:bg-palm-brown-light transition-colors"
              aria-label={`Increase ${item.name}`}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="font-poppins text-xs font-semibold text-palm-brown/45 tabular-nums">
            {money(item.price * item.qty)}
          </span>
        </div>

      </div>
    </div>
  );
}

function RecommendationCard({ item, onAdd }) {
  const [imageSrc, setImageSrc] = useState(item.image_url || fallbackImages[item.name]);
  return (
    <article className="w-56 shrink-0 overflow-hidden rounded-3xl border border-cream-dark bg-cream-light shadow-card"><div className="h-32 overflow-hidden bg-cream-dark"><img src={imageSrc} alt={item.name} className="h-full w-full object-cover" loading="eager" onError={() => { if (imageSrc !== "/makhana.svg") setImageSrc("/makhana.svg"); }} /></div><div className="p-3"><h3 className="truncate font-menu text-base font-semibold text-palm-brown">{item.name}</h3><div className="mt-2 flex items-center justify-between gap-2"><span className="font-sans text-sm font-bold text-palm-brown">{money(item.price)}</span><button onClick={() => onAdd(item)} className="rounded-full bg-palm-brown px-3 py-1.5 font-sans text-xs font-semibold text-cream transition-colors hover:bg-amber-accent">Add</button></div></div></article>
  );
}

export default function Cart() {
  const navigate = useNavigate();
  const { items, cartTotal, cartCount, updateQty, removeItem, addItem } = useCart();
  const { showToast } = useToast();
  const { session: qrSession } = useQRSession();   // non-null when dine-in QR was scanned

  // dine_in mode is determined by QRSessionContext — cannot be changed by the customer
  const isDineIn = Boolean(qrSession?.sessionToken);

  const [menu, setMenu] = useState([]);
  const [zones, setZones] = useState([]);
  const [houseNumber, setHouseNumber] = useState("");
  const [area, setArea] = useState("");
  const [distance, setDistance] = useState("");
  const [addressError, setAddressError] = useState("");
  const [orderType, setOrderType] = useState(null); // "takeaway" | "delivery" | null (ignored for dine-in)
  const [loading, setLoading] = useState(true);
  const addressRef = useRef(null);

  // Scroll to address section when Delivery is newly selected, accounting for
  // the fixed navbar (~80px). Only fires on first selection, not on re-clicks.
  const handleSelectDelivery = useCallback(() => {
    const wasAlreadyDelivery = orderType === "delivery";
    setOrderType("delivery");
    setAddressError("");
    if (!wasAlreadyDelivery) {
      // Wait one frame for the section to mount before scrolling
      requestAnimationFrame(() => {
        const el = addressRef.current;
        if (!el) return;
        const NAVBAR_HEIGHT = 88; // px — matches the fixed navbar + buffer
        const top = el.getBoundingClientRect().top + window.scrollY - NAVBAR_HEIGHT;
        window.scrollTo({ top, behavior: "smooth" });
      });
    }
  }, [orderType]);

  useEffect(() => { Promise.all([apiFetch("/menu"), apiFetch("/orders/delivery-zones")]).then(([menuItems, deliveryZones]) => { setMenu(menuItems); setZones(deliveryZones); }).catch(() => {}).finally(() => setLoading(false)); }, []);

  const cartRows = Object.values(items);
  const menuById = useMemo(() => new Map(menu.map((item) => [String(item.id), item])), [menu]);
  const recommendations = RECOMMENDATIONS.map((recommendation) => {
    const backendItem = menu.find((item) => item.name === recommendation.name || (recommendation.name === "Sprout Chaat" && item.name === "Sprouts Salad"));
    return backendItem && !items[backendItem.id] ? { ...backendItem, ...recommendation, id: backendItem.id, image_url: backendItem.image_url || fallbackImages[recommendation.name] } : { ...recommendation, id: `recommendation-${recommendation.name.toLowerCase().replace(/\s+/g, "-")}`, is_available: true };
  }).filter((item) => item.name !== "Ginger Chai");
  const address = `${houseNumber.trim()}, ${area.trim()}`.replace(/^, |, $/g, "");
  const selectedDistance = Number(distance);
  const itemTotal = Number(cartTotal || 0);
  const deliveryCharge = orderType === "delivery" && address && distance ? getCharge(zones, selectedDistance) : 0;
  const taxes = itemTotal * 0.05;
  const finalTotal = itemTotal + deliveryCharge + taxes;
  const eta = orderType === "delivery" && address && distance ? getEta(selectedDistance, cartCount) : null;
  const addressReady = houseNumber.trim().length >= 2 && area.trim().length >= 2 && distance;
  // Checkout is enabled when: dine-in (always ready) OR takeaway OR delivery+address
  const canCheckout = isDineIn || orderType === "takeaway" || (orderType === "delivery" && addressReady);

  function handleAdd(item) { addItem(item); showToast(`${item.name} added to cart`); }
  function handleCheckout() {
    if (isDineIn) {
      // Dine-in: pass session token in location state — never in the URL
      navigate("/checkout", {
        state: {
          orderType:    "dine_in",
          sessionToken: qrSession.sessionToken,  // stays out of URL
          tableNumber:  qrSession.tableNumber,
          taxes:        itemTotal * 0.05,
          finalTotal:   itemTotal + itemTotal * 0.05,
          deliveryCharge: 0,
        },
      });
      return;
    }
    if (!orderType) { setAddressError("Please select an order type to continue."); return; }
    if (orderType === "delivery") {
      if (!houseNumber.trim() || !area.trim()) { setAddressError("Please enter your house or flat number and area name."); return; }
      if (!distance) { setAddressError("Please select your approximate delivery distance."); return; }
    }
    setAddressError("");
    navigate("/checkout", { state: { address: orderType === "delivery" ? address : null, distance: orderType === "delivery" ? selectedDistance : null, deliveryCharge, taxes, finalTotal, orderType } });
  }

  if (cartRows.length === 0) return <main className="min-h-screen bg-cream px-6 pb-24 pt-28"><div className="mx-auto max-w-xl rounded-[2rem] border border-cream-dark bg-cream-light p-10 text-center shadow-card"><ShoppingBag className="mx-auto h-10 w-10 text-palm-brown/45" /><h1 className="mt-5 font-serif text-3xl font-semibold text-palm-brown">Your cart is waiting</h1><p className="mt-2 font-sans text-sm text-palm-brown/60">Add something nourishing from the menu to begin.</p><button onClick={() => navigate("/#menu")} className="mt-7 rounded-full bg-palm-brown px-6 py-3 font-sans text-sm font-semibold text-cream hover:bg-amber-accent">Browse Menu</button></div></main>;

  return (
    <main className="min-h-screen bg-cream px-4 pb-32 pt-8 sm:px-6 md:pt-12"><div className="mx-auto max-w-6xl">
      <button onClick={() => navigate("/menu")} className="mb-7 flex items-center gap-2 font-sans text-sm font-semibold text-palm-brown/65 hover:text-palm-brown"><ArrowLeft className="h-4 w-4" /> Continue browsing</button>
      <div className="mb-10"><p className="font-sans text-xs font-semibold uppercase tracking-[0.24em] text-amber-accent">Your order</p><h1 className="mt-2 flex items-center gap-3 font-anton text-4xl text-palm-brown sm:text-5xl"><ShoppingCart className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" strokeWidth={1.8} aria-hidden="true" />Your Cart</h1><p className="mt-2 font-sans text-sm text-palm-brown/60">{cartCount} item{cartCount !== 1 ? "s" : ""} in your cart.</p></div>
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)] lg:items-start"><div className="min-w-0 space-y-8">
        <section className="rounded-[2rem] border border-cream-dark bg-cream-light shadow-card sm:px-7" aria-labelledby="cart-items-heading">
          <h2 id="cart-items-heading" className="sr-only">Cart items</h2>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
            {cartRows.map((entry) => (
              <ItemRow
                key={entry.id}
                item={{ ...entry, image_url: entry.image_url || menuById.get(String(entry.id))?.image_url }}
                onUpdate={updateQty}
                onRemove={removeItem}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="meal-heading"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-amber-accent">Good with this</p><h2 id="meal-heading" className="mt-1 font-display text-2xl font-semibold text-palm-brown">Complete Your Meal</h2></div></div>{loading ? <p className="font-sans text-sm text-palm-brown/55">Finding a few good pairings...</p> : <div className="menu-scroll-row flex min-w-0 gap-4 overflow-x-auto pb-3">{recommendations.map((item) => <RecommendationCard key={item.id} item={item} onAdd={handleAdd} />)}</div>}</section>

        {/* ── Delivery address — only shown when delivery is selected ── */}
        {orderType === "delivery" && (
        <section ref={addressRef} className="rounded-[2rem] border border-cream-dark bg-cream-light p-5 shadow-card sm:p-7" aria-labelledby="address-heading"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-dark text-palm-brown"><MapPin className="h-5 w-5" /></span><div><h2 id="address-heading" className="font-display text-2xl font-semibold text-palm-brown">Add Delivery Address</h2><p className="mt-1 font-sans text-sm text-palm-brown/60">Tell us where your Teashore should arrive.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><input value={houseNumber} onChange={(event) => { setHouseNumber(event.target.value); setAddressError(""); }} placeholder="House / Flat No." aria-label="House or flat number" className="w-full rounded-2xl border border-cream-dark bg-cream px-4 py-3 font-sans text-sm text-palm-brown outline-none focus:border-amber-accent" /><input value={area} onChange={(event) => { setArea(event.target.value); setAddressError(""); }} placeholder="Area / Locality" aria-label="Area or locality" className="w-full rounded-2xl border border-cream-dark bg-cream px-4 py-3 font-sans text-sm text-palm-brown outline-none focus:border-amber-accent" /></div><label className="mt-4 block font-sans text-sm font-semibold text-palm-brown">Approximate distance <select value={distance} onChange={(event) => { setDistance(event.target.value); setAddressError(""); }} className="mt-2 block w-full rounded-2xl border border-cream-dark bg-cream px-4 py-3 font-normal text-palm-brown outline-none focus:border-amber-accent"><option value="">Select delivery distance</option><option value="1">Up to 1 km</option><option value="3">1–4 km</option><option value="5">4–5 km</option><option value="7">5–7 km</option><option value="10">7–10 km</option></select></label>{addressError && orderType === "delivery" && <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-3 font-sans text-sm text-red-700">{addressError}</p>}{eta && <div className="mt-4 flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 font-sans text-sm text-green-800"><Check className="h-4 w-4" /> Delivery available · estimated {eta} minutes</div>}</section>
        )}
      </div><aside className="min-w-0 h-fit rounded-[2rem] border border-cream-dark bg-cream-light p-6 shadow-card lg:sticky lg:top-24 lg:self-start space-y-4" aria-label="Order options and bill">

        {/* ── Order type — locked banner for dine-in, selector for others ── */}
        <div aria-labelledby="order-type-heading">
          <h2 id="order-type-heading" className="font-display text-lg font-semibold text-palm-brown">How would you like it?</h2>

          {isDineIn ? (
            /* Locked dine-in banner — customer cannot change the type */
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-palm-brown/20
                            bg-palm-brown/5 px-4 py-3">
              <span aria-hidden="true" className="text-xl">🍽</span>
              <div>
                <p className="font-sans text-sm font-semibold text-palm-brown">
                  Dine In · Table {qrSession.tableNumber}
                </p>
                <p className="font-sans text-xs text-palm-brown/50 mt-0.5">
                  Order type set by your table QR
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { value: "takeaway", label: "Takeaway", icon: "🛍", tip: "Pick up at the counter" },
                { value: "delivery", label: "Delivery",  icon: "🚴", tip: "Delivered to your door"  },
              ].map(({ value, label, icon, tip }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    if (value === "delivery") { handleSelectDelivery(); }
                    else { setOrderType(value); setAddressError(""); }
                  }}
                  title={tip}
                  className={[
                    "flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 font-sans text-sm font-semibold transition-all duration-150",
                    orderType === value
                      ? "border-palm-brown bg-palm-brown text-cream shadow-md"
                      : "border-cream-dark bg-cream text-palm-brown hover:border-palm-brown/40",
                  ].join(" ")}
                  aria-pressed={orderType === value}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          )}
          {addressError && !orderType && <p role="alert" className="mt-2 rounded-2xl bg-red-50 px-3 py-2 font-sans text-xs text-red-700">{addressError}</p>}
        </div>

        {/* ── Bill Details ── */}
        <div aria-labelledby="bill-heading">
          <h2 id="bill-heading" className="font-display text-lg font-semibold text-palm-brown">Bill Details</h2>
          <div className="mt-4 space-y-3 font-sans text-sm">
            <div className="flex justify-between text-palm-brown/70"><span>Item Total</span><span>{money(itemTotal)}</span></div>
            <div className="flex justify-between text-palm-brown/70"><span>Delivery Charges</span><span>{orderType === "delivery" ? (deliveryCharge ? money(deliveryCharge) : addressReady ? "Included" : "Add address") : orderType === "takeaway" ? "—" : "Select type"}</span></div>
            <div className="flex justify-between text-palm-brown/70"><span>Taxes/Charges</span><span>{money(taxes)}</span></div>
            <div className="border-t border-cream-dark pt-3"><div className="flex justify-between text-base font-bold text-palm-brown"><span>Final Total</span><span>{money(finalTotal)}</span></div></div>
          </div>
          <button onClick={handleCheckout} disabled={!canCheckout} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-palm-brown px-5 py-3.5 font-sans text-sm font-semibold text-cream transition-colors hover:bg-amber-accent disabled:opacity-40 disabled:cursor-not-allowed">Proceed to Checkout <ArrowRight className="h-4 w-4" /></button>
          {!isDineIn && !orderType && <p className="mt-2 text-center font-sans text-xs text-palm-brown/50">Select an order type above to continue.</p>}
          {!isDineIn && orderType === "delivery" && !addressReady && <p className="mt-2 text-center font-sans text-xs text-palm-brown/50">Enter your delivery address to continue.</p>}
        </div>

      </aside></div>
    </div></main>
  );
}
