import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "motion/react";
import { apiFetch } from "../lib/api";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import ViewCartBar from "./ViewCartBar";

/* ─────────────────────────────────────────────────────────────────────────
   MENU MACROS — per-serving estimates for all 48 menu items.
   Keyed by exact item name from the database.
   Values are reasonable estimates; not certified nutritional data.
───────────────────────────────────────────────────────────────────────── */
const MENU_MACROS = {
  // ── Teas ────────────────────────────────────────────────────────────
  "Elachi Milk Tea":  { kcal: 120, protein: 3,  carbs: 18, fat: 4 },
  "Ginger Chai":      { kcal: 90,  protein: 2,  carbs: 14, fat: 3 },
  "Iced Masala Chai": { kcal: 150, protein: 3,  carbs: 28, fat: 4 },
  "Kattan Chai":      { kcal: 10,  protein: 0,  carbs: 2,  fat: 0 },
  "Lemon Iced Tea":   { kcal: 80,  protein: 0,  carbs: 20, fat: 0 },
  "Masala Chai":      { kcal: 110, protein: 3,  carbs: 16, fat: 4 },
  "Normal Milk Tea":  { kcal: 100, protein: 3,  carbs: 15, fat: 3 },
  "Rose Milk Tea":    { kcal: 130, protein: 3,  carbs: 21, fat: 4 },
  // ── Coffees ─────────────────────────────────────────────────────────
  "Classic Cappuccino": { kcal: 120, protein: 4,  carbs: 12, fat: 6  },
  "Cold Brew Coffee":   { kcal: 15,  protein: 0,  carbs: 3,  fat: 0  },
  "Cold Coffee":        { kcal: 180, protein: 5,  carbs: 26, fat: 7  },
  "Espresso":           { kcal: 5,   protein: 0,  carbs: 1,  fat: 0  },
  "Filter Coffee":      { kcal: 60,  protein: 2,  carbs: 8,  fat: 2  },
  "Flat White":         { kcal: 110, protein: 4,  carbs: 10, fat: 5  },
  "Masala Coffee":      { kcal: 95,  protein: 3,  carbs: 12, fat: 4  },
  "Mocha":              { kcal: 200, protein: 5,  carbs: 28, fat: 8  },
  // ── Protein Shakes ──────────────────────────────────────────────────
  "Berry Blast Shake":       { kcal: 220, protein: 20, carbs: 28, fat: 4  },
  "Chocolate Banana Shake":  { kcal: 310, protein: 22, carbs: 42, fat: 6  },
  "Coconut Protein Shake":   { kcal: 260, protein: 20, carbs: 24, fat: 10 },
  "Green Protein Shake":     { kcal: 190, protein: 22, carbs: 18, fat: 4  },
  "Mango Protein Shake":     { kcal: 280, protein: 20, carbs: 38, fat: 5  },
  "Peanut Butter Shake":     { kcal: 350, protein: 24, carbs: 30, fat: 14 },
  "Strawberry Shake":        { kcal: 230, protein: 18, carbs: 30, fat: 5  },
  "Vanilla Almond Shake":    { kcal: 270, protein: 20, carbs: 28, fat: 9  },
  // ── Healthy Veg ─────────────────────────────────────────────────────
  "Avocado Toast":          { kcal: 280, protein: 7,  carbs: 30, fat: 15 },
  "Fruit & Nut Bowl":       { kcal: 220, protein: 5,  carbs: 35, fat: 8  },
  "Greek Yogurt Bowl":      { kcal: 190, protein: 12, carbs: 22, fat: 5  },
  "Hummus & Veggie Sticks": { kcal: 160, protein: 6,  carbs: 18, fat: 7  },
  "Multigrain Toast":       { kcal: 180, protein: 6,  carbs: 32, fat: 4  },
  "Paneer Wrap":            { kcal: 310, protein: 14, carbs: 38, fat: 10 },
  "Quinoa Salad":           { kcal: 250, protein: 10, carbs: 36, fat: 7  },
  "Sprouts Salad":          { kcal: 130, protein: 8,  carbs: 20, fat: 2  },
  "Stuffed Paratha":        { kcal: 320, protein: 9,  carbs: 46, fat: 11 },
  "Veggie Sandwich":        { kcal: 240, protein: 8,  carbs: 38, fat: 6  },
  // ── Healthy Non-Veg ─────────────────────────────────────────────────
  "Boiled Egg Bowl":          { kcal: 180, protein: 14, carbs: 8,  fat: 10 },
  "Chicken Caesar Salad":     { kcal: 320, protein: 28, carbs: 14, fat: 16 },
  "Chicken Salad Bowl":       { kcal: 290, protein: 30, carbs: 12, fat: 12 },
  "Chicken Skewers":          { kcal: 260, protein: 32, carbs: 4,  fat: 12 },
  "Egg Sandwich":             { kcal: 310, protein: 18, carbs: 34, fat: 12 },
  "Grilled Chicken Wrap":     { kcal: 370, protein: 30, carbs: 36, fat: 12 },
  "Herb Grilled Chicken":     { kcal: 240, protein: 34, carbs: 3,  fat: 10 },
  "Peri Peri Chicken Bites":  { kcal: 280, protein: 28, carbs: 10, fat: 14 },
  // ── Detox ────────────────────────────────────────────────────────────
  "Ashwagandha Latte":      { kcal: 90,  protein: 2,  carbs: 12, fat: 3 },
  "Beetroot Latte":         { kcal: 110, protein: 2,  carbs: 18, fat: 3 },
  "Detox Green Juice":      { kcal: 70,  protein: 2,  carbs: 14, fat: 1 },
  "Matcha Latte":           { kcal: 100, protein: 3,  carbs: 14, fat: 4 },
  "Turmeric Latte":         { kcal: 95,  protein: 2,  carbs: 13, fat: 4 },
  "Watermelon Mint Cooler": { kcal: 60,  protein: 1,  carbs: 14, fat: 0 },
};

/* ─────────────────────────────────────────────────────────────────────────
   CATEGORY DISPLAY ORDER + LABELS
   Keys must exactly match the category strings returned by the backend.
   Categories not listed here are appended at the end alphabetically.
───────────────────────────────────────────────────────────────────────── */
const CATEGORY_ORDER = [
  "Teas",
  "Coffees",
  "Protein Shakes",
  "Healthy Veg",
  "Healthy Non-Veg",
  "Detox",
];

/**
 * Re-order a categories array from the backend so it follows CATEGORY_ORDER.
 * Any backend category not in CATEGORY_ORDER is appended alphabetically after.
 */
function sortCategories(cats) {
  const ordered = CATEGORY_ORDER.filter((c) => cats.includes(c));
  const rest    = cats.filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...ordered, ...rest];
}

/* ─────────────────────────────────────────────────────────────────────────
   ITEM IMAGE MAP
   Keyed by exact item name from the database.
   All images sourced from Unsplash — warm, premium café/food photography.
   DB image_url always takes precedence; this is the fallback only.
───────────────────────────────────────────────────────────────────────── */
const ITEM_IMAGES = {
  // ── Teas ──────────────────────────────────────────────────────────────
  // Normal Indian milk chai — creamy, chai-coloured liquid in a glass/cup
  "Normal Milk Tea":
    "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80&auto=format&fit=crop",
  // Elachi / cardamom milk tea — milky Indian chai; using warm spiced tea photo
  "Elachi Milk Tea":
    "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600&q=80&auto=format&fit=crop",
  // Kattan / black tea — dark, clear tea without milk
  "Kattan Chai":
    "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80&auto=format&fit=crop",
  // Iced masala chai in tall glass
  "Iced Masala Chai":
    "https://images.unsplash.com/photo-1499638673689-79a0b5115d87?w=600&q=80&auto=format&fit=crop",
  // Ginger chai — warm spiced tea
  "Ginger Chai":
    "https://images.unsplash.com/photo-1567922045116-2a00fae2ed03?w=600&q=80&auto=format&fit=crop",
  // Lemon iced tea — yellow/golden iced drink with lemon
  "Lemon Iced Tea":
    "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&q=80&auto=format&fit=crop",
  // Masala chai — proper Indian spiced milk tea
  "Masala Chai":
    "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600&q=80&auto=format&fit=crop",
  // Rose milk tea — pink/rose-coloured milk drink
  "Rose Milk Tea":
    "https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=600&q=80&auto=format&fit=crop",

  // ── Coffees ───────────────────────────────────────────────────────────
  // Classic cappuccino — espresso with steamed milk foam in ceramic cup
  "Classic Cappuccino":
    "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&q=80&auto=format&fit=crop",
  // Cold brew — dark coffee in a tall glass with ice
  "Cold Brew Coffee":
    "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=80&auto=format&fit=crop",
  // Cold coffee — blended iced coffee, creamy top
  "Cold Coffee":
    "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&q=80&auto=format&fit=crop",
  // Espresso — small espresso shot in ceramic cup
  "Espresso":
    "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&q=80&auto=format&fit=crop",
  // South Indian filter coffee — strong dark coffee, ideally with steel tumbler feel
  "Filter Coffee":
    "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80&auto=format&fit=crop",
  // Flat white — espresso with velvety microfoam
  "Flat White":
    "https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=600&q=80&auto=format&fit=crop",
  // Masala coffee — dark spiced coffee with cinnamon/spice
  "Masala Coffee":
    "https://images.unsplash.com/photo-1534040385115-33dcb3acba5b?w=600&q=80&auto=format&fit=crop",
  // Mocha — chocolate coffee with whipped cream or chocolate drizzle
  "Mocha":
    "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=600&q=80&auto=format&fit=crop",

  // ── Protein Shakes ────────────────────────────────────────────────────
  // Berry blast — purple/red berry smoothie
  "Berry Blast Shake":
    "https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=600&q=80&auto=format&fit=crop",
  // Chocolate banana — brown creamy shake
  "Chocolate Banana Shake":
    "https://images.unsplash.com/photo-1543352634-a1c51d9f1fa7?w=600&q=80&auto=format&fit=crop",
  // Coconut protein — white/coconut-coloured creamy shake with coconut
  "Coconut Protein Shake":
    "https://images.unsplash.com/photo-1585238342024-78d387f4a707?w=600&q=80&auto=format&fit=crop",
  // Green protein — bright green smoothie/shake
  "Green Protein Shake":
    "https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=600&q=80&auto=format&fit=crop",
  // Mango protein — bright yellow mango shake
  "Mango Protein Shake":
    "https://images.unsplash.com/photo-1546173159-315724a31696?w=600&q=80&auto=format&fit=crop",
  // Peanut butter — thick beige/tan shake
  "Peanut Butter Shake":
    "https://images.unsplash.com/photo-1553787499-6f9133860278?w=600&q=80&auto=format&fit=crop",
  // Strawberry — pink/red strawberry shake
  "Strawberry Shake":
    "https://images.unsplash.com/photo-1488900128323-21503983a07e?w=600&q=80&auto=format&fit=crop",
  // Vanilla almond — creamy off-white milky shake with nuts
  "Vanilla Almond Shake":
    "https://images.unsplash.com/photo-1553361371-9b22f78e8b1d?w=600&q=80&auto=format&fit=crop",

  // ── Healthy Veg ───────────────────────────────────────────────────────
  "Avocado Toast":
    "https://images.unsplash.com/photo-1588137378633-dea1336ce1e2?w=600&q=80&auto=format&fit=crop",
  "Fruit & Nut Bowl":
    "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=600&q=80&auto=format&fit=crop",
  "Greek Yogurt Bowl":
    "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=80&auto=format&fit=crop",
  "Hummus & Veggie Sticks":
    "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80&auto=format&fit=crop",
  "Multigrain Toast":
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80&auto=format&fit=crop",
  "Paneer Wrap":
    "https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&q=80&auto=format&fit=crop",
  "Quinoa Salad":
    "https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?w=600&q=80&auto=format&fit=crop",
  "Sprouts Salad":
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80&auto=format&fit=crop",
  "Stuffed Paratha":
    "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80&auto=format&fit=crop",
  "Veggie Sandwich":
    "https://images.unsplash.com/photo-1481070414801-51fd732d7184?w=600&q=80&auto=format&fit=crop",

  // ── Healthy Non-Veg ───────────────────────────────────────────────────
  // Boiled eggs — halved boiled eggs in a bowl
  "Boiled Egg Bowl":
    "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&q=80&auto=format&fit=crop",
  // Caesar salad with grilled chicken strips
  "Chicken Caesar Salad":
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80&auto=format&fit=crop",
  // Chicken salad bowl — colourful bowl with greens and chicken
  "Chicken Salad Bowl":
    "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&q=80&auto=format&fit=crop",
  // Grilled chicken skewers on a plate
  "Chicken Skewers":
    "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=600&q=80&auto=format&fit=crop",
  // Egg sandwich — toasted sandwich with egg
  "Egg Sandwich":
    "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&q=80&auto=format&fit=crop",
  // Grilled chicken wrap — flatbread wrap with chicken and greens
  "Grilled Chicken Wrap":
    "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&q=80&auto=format&fit=crop",
  // Herb grilled chicken — golden-brown herb-marinated grilled chicken
  "Herb Grilled Chicken":
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=80&auto=format&fit=crop",
  // Peri peri chicken — spicy red-coated chicken bites
  "Peri Peri Chicken Bites":
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=80&auto=format&fit=crop",

  // ── Detox ─────────────────────────────────────────────────────────────
  // Ashwagandha latte — warm beige/brown adaptogen latte
  "Ashwagandha Latte":
    "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&q=80&auto=format&fit=crop",
  // Beetroot latte — deep pink/berry-coloured drink
  "Beetroot Latte":
    "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=80&auto=format&fit=crop",
  // Detox green juice — bright green cold-pressed juice
  "Detox Green Juice":
    "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=600&q=80&auto=format&fit=crop",
  // Matcha latte — green matcha in a ceramic cup with latte art
  "Matcha Latte":
    "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=600&q=80&auto=format&fit=crop",
  // Turmeric latte — golden/amber warm drink
  "Turmeric Latte":
    "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&q=80&auto=format&fit=crop",
  // Watermelon mint cooler — red fruit juice with mint leaves
  "Watermelon Mint Cooler":
    "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=80&auto=format&fit=crop",
};

/* ─────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────── */

/** Format a Decimal price string from the backend → "₹60" */
function formatPrice(price) {
  const n = parseFloat(price);
  if (isNaN(n)) return `₹${price}`;
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** Group a flat array of items by their category field, preserving category order. */
function groupByCategory(items, categories) {
  const map = {};
  categories.forEach((cat) => { map[cat] = []; });
  items.forEach((item) => {
    if (map[item.category] !== undefined) {
      map[item.category].push(item);
    }
  });
  return categories.map((cat) => ({ id: cat, label: cat, items: map[cat] }));
}

/* ─────────────────────────────────────────────────────────────────────────
   FALLBACK IMAGE — shown when image_url is null / fails to load
───────────────────────────────────────────────────────────────────────── */
function ImagePlaceholder() {
  return (
    <div
      className="w-full h-full bg-cream-dark flex items-center justify-center"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="w-12 h-12 text-palm-brown/20"
        aria-hidden="true"
      >
        <rect x="4" y="10" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2"/>
        <circle cx="17" cy="22" r="4" stroke="currentColor" strokeWidth="2"/>
        <path d="M4 34l10-8 8 6 7-5 15 11" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MENU CARD
   - Available item with qty 0 : shows the "+" add button.
   - Available item with qty ≥ 1 : shows − qty + stepper + trash remove.
   - Unavailable item : dimmed overlay, disabled button.
   Card dimensions, typography, colors, spacing unchanged.
───────────────────────────────────────────────────────────────────────── */
function MenuCard({ item }) {
  const [imgError, setImgError] = useState(false);
  const unavailable = !item.is_available;

  const { items, addItem, updateQty, removeItem } = useCart();
  const { showToast } = useToast();

  const cartEntry = items[item.id];
  const qty       = cartEntry?.qty ?? 0;
  const macros    = MENU_MACROS[item.name] ?? null;

  // Prefer DB image_url, fall back to curated lookup, then placeholder
  const resolvedImg = (!imgError && (item.image_url || ITEM_IMAGES[item.name])) || null;

  function handleAdd() {
    addItem(item);
    showToast(`${item.name} added to cart`);
  }

  function handleIncrease() {
    updateQty(item.id, qty + 1);
  }

  function handleDecrease() {
    if (qty === 1) {
      removeItem(item.id);
      showToast(`${item.name} removed`, "info");
    } else {
      updateQty(item.id, qty - 1);
    }
  }

  function handleRemove() {
    removeItem(item.id);
    showToast(`${item.name} removed`, "info");
  }

  return (
    <div
      className={[
        "shrink-0 w-64 rounded-card overflow-hidden",
        "bg-cream-light border border-cream-dark shadow-card",
        "cursor-pointer group transition-shadow duration-300",
        unavailable ? "opacity-60" : "hover:shadow-card-hover",
      ].join(" ")}
    >
      {/* Image */}
      <div className="relative overflow-hidden h-52">
        {resolvedImg ? (
          <img
            src={resolvedImg}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            draggable="false"
            onError={() => setImgError(true)}
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Unavailable overlay */}
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-palm-brown/30 backdrop-blur-[2px]">
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-cream bg-palm-brown/70 px-3 py-1 rounded-full">
              Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-poppins text-sm font-bold uppercase tracking-wide text-palm-brown leading-tight line-clamp-2 min-h-[2.5rem]">
            {item.name}
          </h3>
          {macros && (
            <p className="mt-1 font-sans text-[11px] text-palm-brown/50 leading-4">
              <span className="block">{macros.kcal} kcal</span>
              <span className="block">{macros.protein}g protein</span>
              <span className="block">{macros.carbs}g carbs</span>
              <span className="block">{macros.fat}g fat</span>
            </p>
          )}
          <p className="font-poppins text-sm font-bold uppercase tracking-wide text-palm-brown mt-2">
            {formatPrice(item.price)}
          </p>
        </div>

        {/* ── Cart control ── */}
        <AnimatePresence mode="wait" initial={false}>
          {unavailable ? (
            /* Disabled state */
            <button
              key="disabled"
              disabled
              className="shrink-0 w-7 h-7 rounded-full bg-palm-brown/30 text-cream
                         flex items-center justify-center text-sm font-bold cursor-not-allowed"
              aria-label={`${item.name} is unavailable`}
            >
              +
            </button>

          ) : qty === 0 ? (
            /* Add button */
            <motion.button
              key="add"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1   }}
              exit={{    opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={handleAdd}
              className="shrink-0 w-7 h-7 rounded-full bg-palm-brown text-cream
                         flex items-center justify-center text-sm font-bold
                         hover:bg-amber-accent transition-colors duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent"
              aria-label={`Add ${item.name} to cart`}
            >
              +
            </motion.button>

          ) : (
            /* Qty stepper */
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1    }}
              exit={{    opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 flex items-center gap-1"
            >
              {/* − always shows as minus; removes item when qty reaches 0 */}
              <button
                onClick={handleDecrease}
                className="w-7 h-7 rounded-full bg-palm-brown text-cream
                           flex items-center justify-center
                           hover:bg-amber-accent transition-colors duration-200
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent"
                aria-label={qty === 1 ? `Remove ${item.name} from cart` : `Decrease quantity of ${item.name}`}
              >
                <span className="text-sm font-bold leading-none">−</span>
              </button>

              {/* Qty count */}
              <span className="w-5 text-center font-poppins text-sm font-semibold text-palm-brown select-none">
                {qty}
              </span>

              {/* + */}
              <button
                onClick={handleIncrease}
                className="w-7 h-7 rounded-full bg-palm-brown text-cream
                           flex items-center justify-center text-sm font-bold
                           hover:bg-amber-accent transition-colors duration-200
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent"
                aria-label={`Increase quantity of ${item.name}`}
              >
                +
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TEA CARD — Teas category only.
   Same card shape/bg/image style as MenuCard; keeps macros line + name font.
───────────────────────────────────────────────────────────────────────── */
function TeaCard({ item }) {
  const [imgError, setImgError] = useState(false);
  const unavailable = !item.is_available;

  const { items, addItem, updateQty, removeItem } = useCart();
  const { showToast } = useToast();

  const cartEntry = items[item.id];
  const qty       = cartEntry?.qty ?? 0;
  const macros    = MENU_MACROS[item.name] ?? null;

  const resolvedImg = (!imgError && (item.image_url || ITEM_IMAGES[item.name])) || null;

  function handleAdd()      { addItem(item); showToast(`${item.name} added to cart`); }
  function handleIncrease() { updateQty(item.id, qty + 1); }
  function handleDecrease() {
    if (qty === 1) { removeItem(item.id); showToast(`${item.name} removed`, "info"); }
    else updateQty(item.id, qty - 1);
  }

  return (
    <div
      className={[
        "shrink-0 w-64 rounded-card overflow-hidden",
        "bg-cream-light border border-cream-dark shadow-card",
        "cursor-pointer group transition-shadow duration-300",
        unavailable ? "opacity-60" : "hover:shadow-card-hover",
      ].join(" ")}
    >
      {/* Image — same style as MenuCard (object-cover, h-52) */}
      <div className="relative overflow-hidden h-52">
        {resolvedImg ? (
          <img
            src={resolvedImg}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            draggable="false"
            onError={() => setImgError(true)}
          />
        ) : (
          <ImagePlaceholder />
        )}
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-palm-brown/30 backdrop-blur-[2px]">
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-cream bg-palm-brown/70 px-3 py-1 rounded-full">
              Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Info row — same layout as MenuCard */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Name — kept as poppins bold uppercase (user's request) */}
          <h3 className="font-poppins text-sm font-bold uppercase tracking-wide text-palm-brown leading-tight line-clamp-2 min-h-[2.5rem]">
            {item.name}
          </h3>
          {macros && (
            <p className="mt-1 font-sans text-[11px] text-palm-brown/50 leading-4">
              <span className="block">{macros.kcal} kcal</span>
              <span className="block">{macros.protein}g protein</span>
              <span className="block">{macros.carbs}g carbs</span>
              <span className="block">{macros.fat}g fat</span>
            </p>
          )}
          <p className="font-poppins text-sm font-bold uppercase tracking-wide text-palm-brown mt-2">
            {formatPrice(item.price)}
          </p>
        </div>

        {/* Cart control — identical to MenuCard */}
        <AnimatePresence mode="wait" initial={false}>
          {unavailable ? (
            <button key="disabled" disabled
              className="shrink-0 w-7 h-7 rounded-full bg-palm-brown/30 text-cream flex items-center justify-center text-sm font-bold cursor-not-allowed mt-0.5"
              aria-label={`${item.name} is unavailable`}>+</button>

          ) : qty === 0 ? (
            <motion.button key="add"
              initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={handleAdd}
              className="shrink-0 w-7 h-7 rounded-full bg-palm-brown text-cream flex items-center justify-center text-sm font-bold hover:bg-amber-accent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent mt-0.5"
              aria-label={`Add ${item.name} to cart`}>+</motion.button>

          ) : (
            <motion.div key="stepper"
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 flex items-center gap-1 mt-0.5">
              <button onClick={handleDecrease}
                className="w-7 h-7 rounded-full bg-palm-brown text-cream flex items-center justify-center hover:bg-amber-accent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent"
                aria-label={qty === 1 ? `Remove ${item.name} from cart` : `Decrease quantity of ${item.name}`}>
                <span className="text-sm font-bold leading-none">−</span>
              </button>
              <span className="w-5 text-center font-poppins text-sm font-semibold text-palm-brown select-none">{qty}</span>
              <button onClick={handleIncrease}
                className="w-7 h-7 rounded-full bg-palm-brown text-cream flex items-center justify-center text-sm font-bold hover:bg-amber-accent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent"
                aria-label={`Increase quantity of ${item.name}`}>+</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SKELETON CARD — shown while data is loading
───────────────────────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="shrink-0 w-64 rounded-card overflow-hidden bg-cream-light border border-cream-dark shadow-card animate-pulse">
      <div className="h-52 bg-cream-dark" />
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-cream-dark rounded w-4/5" />
          <div className="h-4 bg-cream-dark rounded w-2/5" />
        </div>
        <div className="shrink-0 w-7 h-7 rounded-full bg-cream-dark" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SCROLL ROW — CSS overflow-x-auto + scroll-progress bar (unchanged layout)
───────────────────────────────────────────────────────────────────────── */
function ScrollRow({ row, index, loading }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const container = ref.current?.querySelector(".menu-scroll-row");
    if (!container) return;
    const update = () => {
      const max = container.scrollWidth - container.clientWidth;
      setScrollProgress(max <= 0 ? 100 : (container.scrollLeft / max) * 100);
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, []);

  const SKELETON_COUNT = 5;

  return (
    <div ref={ref} className="mb-12 last:mb-0">
      <motion.h3
        initial={{ opacity: 0, x: -16 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: index * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-5 px-1 font-sans text-sm font-semibold uppercase tracking-widest text-palm-brown/55"
      >
        {row.label}
      </motion.h3>

      <div
        className="menu-scroll-row overflow-x-auto [-webkit-overflow-scrolling:touch]"
        aria-label={`${row.label} — swipe or scroll to browse`}
      >
        <div className="flex gap-5 pb-3">
          {loading
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <SkeletonCard key={i} />
              ))
            : row.items.length === 0
            ? (
              <p className="font-sans text-sm text-palm-brown/50 px-1 py-8">
                No items available in this category.
              </p>
            )
            : row.items.map((item) => (
                row.id === "Teas"
                  ? <TeaCard key={item.id} item={item} />
                  : <MenuCard key={item.id} item={item} />
              ))
          }
        </div>
      </div>

      <div className="hidden md:block pt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream-dark/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-palm-brown via-palm-brown to-amber-accent transition-[width] duration-300 ease-out"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   CATEGORY FILTER PILLS
───────────────────────────────────────────────────────────────────────── */
function CategoryFilter({ categories, active, onChange }) {
  if (categories.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 justify-center mb-10" role="group" aria-label="Filter by category">
      <button
        onClick={() => onChange(null)}
        className={[
          "px-4 py-1.5 rounded-full font-sans text-xs font-semibold uppercase tracking-widest",
          "transition-colors duration-200 border",
          active === null
            ? "bg-palm-brown text-cream border-palm-brown"
            : "bg-transparent text-palm-brown/60 border-cream-dark hover:text-palm-brown hover:border-palm-brown/30",
        ].join(" ")}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={[
            "px-4 py-1.5 rounded-full font-sans text-xs font-semibold uppercase tracking-widest",
            "transition-colors duration-200 border",
            active === cat
              ? "bg-palm-brown text-cream border-palm-brown"
              : "bg-transparent text-palm-brown/60 border-cream-dark hover:text-palm-brown hover:border-palm-brown/30",
          ].join(" ")}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ERROR BANNER
───────────────────────────────────────────────────────────────────────── */
function ErrorBanner({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="mb-10 rounded-2xl border border-red-200 bg-red-50 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4"
    >
      <div className="flex-1">
        <p className="font-sans font-semibold text-sm text-red-700">Failed to load menu</p>
        <p className="font-sans text-xs text-red-600/80 mt-0.5">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="shrink-0 px-5 py-2 rounded-full bg-palm-brown text-cream font-sans text-xs font-semibold uppercase tracking-widest hover:bg-amber-accent transition-colors duration-200"
      >
        Retry
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTION — MenuPreview
   Fetches categories + all items on mount. Groups items by category.
   Category filter pills let users show a single category's row only.
───────────────────────────────────────────────────────────────────────── */
export default function MenuPreview() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const [categories,     setCategories]     = useState([]);
  const [items,          setItems]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [activeCategory, setActiveCategory] = useState(null); // null = All

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Both requests in parallel — categories first for ordering, items for data
      const [cats, allItems] = await Promise.all([
        apiFetch("/menu/categories"),
        apiFetch("/menu"),
      ]);
      setCategories(sortCategories(cats));
      setItems(allItems);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  // Build rows: if a category filter is active, show only that row
  const rows = (() => {
    const allRows = groupByCategory(items, categories);
    if (!activeCategory) return allRows;
    return allRows.filter((r) => r.id === activeCategory);
  })();

  // Skeleton rows while loading — use placeholder labels
  const skeletonRows = loading
    ? [
        { id: "s1", label: "Loading…", items: [] },
        { id: "s2", label: "Loading…", items: [] },
      ]
    : null;

  const stagger = {
    hidden:  {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
  };
  const fadeUp = {
    hidden:  { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <section
      id="menu"
      ref={ref}
      className="py-20 md:py-28 bg-cream"
      aria-label="Menu preview"
    >
      <div className="max-w-7xl mx-auto px-6">

        {/* Section header — unchanged */}
        <motion.div
          className="mb-14 flex flex-col items-center text-center"
          variants={stagger}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
        >
          <motion.span
            variants={fadeUp}
            className="block font-sans text-sm font-semibold tracking-widest uppercase text-amber-accent mb-3"
          >
            What We Serve
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="font-anton uppercase text-palm-brown tracking-tight leading-none text-[clamp(2.8rem,7vw,5rem)]"
          >
            Explore Our Menu
          </motion.h2>
        </motion.div>

        {/* Error state */}
        {error && <ErrorBanner message={error} onRetry={fetchMenu} />}

        {/* Category filter pills — only after data loaded */}
        {!loading && !error && (
          <CategoryFilter
            categories={categories}
            active={activeCategory}
            onChange={setActiveCategory}
          />
        )}

        {/* Rows */}
        {(loading ? skeletonRows : rows).map((row, i) => (
          <ScrollRow key={row.id} row={row} index={i} loading={loading} />
        ))}

        {/* Empty state — no items at all (not a load/error issue) */}
        {!loading && !error && items.length === 0 && (
          <p className="text-center font-sans text-sm text-palm-brown/50 py-16">
            The menu is currently empty. Check back soon.
          </p>
        )}

      </div>
      <ViewCartBar />
    </section>
  );
}
