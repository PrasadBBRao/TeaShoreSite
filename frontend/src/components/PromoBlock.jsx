import { useEffect, useRef, useState } from "react";
import { motion, useInView }           from "motion/react";
import seasonalImg                      from "../assets/seasonal-saffron-chai.png";
import { useCart }                      from "../context/CartContext";
import { useToast }                     from "../context/ToastContext";
import { apiFetch }                     from "../lib/api";

/* ── The seasonal item name — change each season ─────────────────────── */
const SEASONAL_ITEM_NAME = "Saffron Chai";

/* ── Animation variants ──────────────────────────────────────────────── */
const fadeLeft = {
  hidden:  { opacity: 0, x: -32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.78, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.11, delayChildren: 0.22 } },
};
const fadeUp = {
  hidden:  { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.58, ease: [0.22, 1, 0.36, 1] } },
};

const BULLETS = [
  "Freshly crafted seasonal favourite",
  "Perfect with our healthy cafe menu",
  "Available for a limited time",
];

/* ══════════════════════════════════════════════════════════════════════
   PROMO BLOCK — Autumn Wellness seasonal special
══════════════════════════════════════════════════════════════════════ */
export default function PromoBlock() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  /* Cart */
  const { items, addItem, updateQty, removeItem } = useCart();
  const { showToast } = useToast();

  /* Fetch the seasonal menu item so we have its id + price */
  const [menuItem, setMenuItem] = useState(null);

  useEffect(() => {
    apiFetch("/menu")
      .then(data => {
        const found = data.find(i => i.name === SEASONAL_ITEM_NAME && i.is_available);
        if (found) setMenuItem(found);
      })
      .catch(() => {}); // fail silently — button just stays hidden
  }, []);

  /* Derived cart qty for this item */
  const cartEntry = menuItem ? items[menuItem.id] : null;
  const qty       = cartEntry?.qty ?? 0;

  function handleAdd() {
    if (!menuItem) return;
    addItem(menuItem);
    showToast(`${menuItem.name} added to cart`);
  }
  function handleIncrease() {
    if (!menuItem) return;
    updateQty(menuItem.id, qty + 1);
  }
  function handleDecrease() {
    if (!menuItem) return;
    if (qty === 1) {
      removeItem(menuItem.id);
      showToast(`${menuItem.name} removed`, "info");
    } else {
      updateQty(menuItem.id, qty - 1);
    }
  }

  const priceLabel = menuItem ? `₹${menuItem.price}` : "₹149";

  return (
    <section
      id="seasonal-special"
      ref={ref}
      className="py-10 md:py-14 px-4 sm:px-6 bg-cream overflow-hidden"
      aria-label="Seasonal special — Autumn Wellness"
    >
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 rounded-[1.5rem] overflow-hidden"
          style={{ boxShadow: "0 8px 40px rgba(74,48,36,0.14)" }}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
        >

          {/* ════════════════════════════════════════════════════════
              LEFT — image panel
          ════════════════════════════════════════════════════════ */}
          <motion.div
            variants={fadeLeft}
            className="relative overflow-hidden min-h-[300px] md:min-h-[480px]"
          >
            <img
              src={seasonalImg}
              alt="Saffron chai — Teashore Autumn Wellness seasonal special"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: "center 15%" }}
              loading="lazy"
            />

            {/* Badge — top-left, no dot */}
            <div
              className="absolute top-4 left-4 flex items-center rounded-full px-3 py-1.5"
              style={{
                background:     "rgba(245,235,221,0.82)",
                backdropFilter: "blur(6px)",
                border:         "1px solid rgba(184,117,63,0.30)",
              }}
            >
              <span
                className="font-sans font-bold uppercase tracking-[0.22em] leading-none"
                style={{ fontSize: "0.6rem", color: "#503326" }}
              >
                Limited Time 🔥
              </span>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════════════════════
              RIGHT — content panel (dark brown)
          ════════════════════════════════════════════════════════ */}
          <motion.div
            variants={stagger}
            className="flex flex-col justify-center px-8 py-10 sm:px-10 sm:py-12 gap-5"
            style={{ background: "#503326" }}
          >
            {/* Eyebrow */}
            <motion.p
              variants={fadeUp}
              className="font-sans font-bold uppercase tracking-[0.28em]"
              style={{ fontSize: "0.65rem", color: "#B8753F" }}
            >
              Seasonal Special
            </motion.p>

            {/* Main heading — Anton, same as "Explore Our Menu" */}
            <motion.div variants={fadeUp} className="leading-tight">
              <h2
                className="font-anton uppercase"
                style={{
                  fontSize:      "clamp(1.65rem, 3.2vw, 2.5rem)",
                  color:         "#F5EBDD",
                  letterSpacing: "0.02em",
                  lineHeight:    1.12,
                }}
              >
                Autumn Wellness
                <br />
                <span style={{ color: "#B8753F" }}>at Tea Shore</span>
              </h2>
            </motion.div>

            {/* Italic subheading */}
            <motion.p
              variants={fadeUp}
              className="font-menu italic"
              style={{ fontSize: "1rem", color: "#D4B99A", fontWeight: 500 }}
            >
              Sip Something Special
            </motion.p>

            {/* Description */}
            <motion.p
              variants={fadeUp}
              className="font-sans text-sm leading-relaxed"
              style={{ color: "#C4A882", maxWidth: "26rem" }}
            >
              A limited seasonal selection crafted for slow afternoons, good
              conversations, and a little extra comfort.
            </motion.p>

            {/* Bullets */}
            <motion.ul variants={stagger} className="flex flex-col gap-2.5">
              {BULLETS.map(line => (
                <motion.li
                  key={line}
                  variants={fadeUp}
                  className="flex items-center gap-3 font-sans text-sm"
                  style={{ color: "#E8D5BE" }}
                >
                  <span
                    className="shrink-0 w-1.5 h-1.5 rounded-full"
                    style={{ background: "#B8753F" }}
                    aria-hidden="true"
                  />
                  {line}
                </motion.li>
              ))}
            </motion.ul>

            {/* CTA / stepper */}
            <motion.div variants={fadeUp} className="pt-1">
              {qty === 0 ? (
                /* ── Add button ── */
                <button
                  onClick={handleAdd}
                  disabled={!menuItem}
                  className="inline-flex items-center gap-3 rounded-full
                             font-sans text-sm font-semibold uppercase tracking-[0.12em]
                             transition-all duration-300
                             hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8753F]
                             disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#F5EBDD", color: "#503326", padding: "0.75rem 1.625rem" }}
                  aria-label="Add Saffron Chai to cart"
                >
                  Try the Seasonal Special
                  <span
                    className="flex items-center justify-center w-6 h-6 rounded-full shrink-0"
                    style={{ background: "#B8753F" }}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="rgba(245,235,221,0.90)"
                      strokeWidth="2.5" strokeLinecap="round"
                      className="w-3 h-3">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </span>
                </button>
              ) : (
                /* ── Qty stepper ── */
                <div className="inline-flex items-center gap-0 rounded-full overflow-hidden"
                  style={{ background: "#F5EBDD" }}>
                  {/* − */}
                  <button
                    onClick={handleDecrease}
                    aria-label="Remove one"
                    className="flex items-center justify-center w-11 h-11
                               font-bold text-lg transition-colors
                               hover:bg-[#e8d9c6] active:bg-[#dccbb5]
                               focus-visible:outline-none"
                    style={{ color: "#503326" }}
                  >
                    −
                  </button>

                  {/* qty + price */}
                  <div className="flex flex-col items-center px-3 min-w-[3.5rem]">
                    <span className="font-poppins font-bold text-base tabular-nums"
                      style={{ color: "#503326", lineHeight: 1.2 }}>
                      {qty}
                    </span>
                    <span className="font-sans text-[10px] font-semibold"
                      style={{ color: "#8A6A50" }}>
                      {priceLabel}
                    </span>
                  </div>

                  {/* + */}
                  <button
                    onClick={handleIncrease}
                    aria-label="Add one more"
                    className="flex items-center justify-center w-11 h-11
                               font-bold text-lg transition-colors
                               hover:bg-[#e8d9c6] active:bg-[#dccbb5]
                               focus-visible:outline-none"
                    style={{ color: "#503326" }}
                  >
                    +
                  </button>
                </div>
              )}
            </motion.div>

          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
