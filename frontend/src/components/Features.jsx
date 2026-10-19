import { useRef } from "react";
import { motion, useInView } from "motion/react";

// Custom icon images — processed transparent PNGs, pre-colored to palm-brown
import imgFreshly  from "../assets/icon-fresh-squeezed-processed.png";
import imgEthical  from "../assets/icon-ethically-sourced-processed.png";
import imgDelivery from "../assets/icon-fast-delivery-processed.png";

/* ════════════════════════════════════════════════════════════════════════════
   INK SPLATTER TEXTURES
   ─────────────────────────────────────────────────────────────────────────
   Each splatter has:
   1. ONE main irregular blob with jagged/spiky protrusions — NOT a smooth
      oval. Made with sharp-angled path segments and abrupt direction changes
      to mimic ink hitting a surface.
   2. 6-8 fully SEPARATE standalone droplet circles of varying sizes,
      scattered in an arc around/near the main shape. None touch the main
      shape — they are the "separated drops" from the impact.
   3. Everything sits upper-right, leaving the left (text) area clean.
   4. Color: warm taupe #c4b5a0 at 0.11–0.13 opacity.
   5. No smooth bezier blobs — all edges are deliberately irregular.
════════════════════════════════════════════════════════════════════════════ */

/* Splatter 1 — upper-right heavy, droplets arc down-left */
const WatercolorSplash1 = () => (
  <svg
    viewBox="0 0 400 260"
    className="absolute inset-0 w-full h-full pointer-events-none select-none"
    aria-hidden="true"
    preserveAspectRatio="xMidYMid slice"
  >
    {/* Main splatter body — jagged irregular blob, right-centre */}
    <path
      d="M290,30
         L310,18 L318,34 L334,22 L340,40 L358,32 L354,52
         L372,48 L368,68 L382,72 L374,88 L384,98 L368,102
         L378,118 L360,118 L362,136 L344,130 L340,148
         L320,138 L312,156 L298,142 L284,158 L276,140
         L256,148 L258,130 L240,132 L246,114 L228,112
         L240,96  L222,88  L240,80  L228,66  L248,68
         L244,50  L262,54  L264,36  L280,42  Z"
      fill="#c4b5a0" opacity="0.13"
    />
    {/* Inner darker core — gives depth to the splatter */}
    <path
      d="M300,58 L312,50 L318,64 L330,58 L326,74 L338,78
         L328,90 L336,100 L320,100 L318,114 L306,106
         L298,118 L290,106 L278,112 L280,98 L266,94
         L278,84 L268,72 L284,76 Z"
      fill="#c4b5a0" opacity="0.09"
    />
    {/* ── Separate droplets — scattered around the main splash ── */}
    {/* Large drop — upper-right of main */}
    <circle cx="368" cy="26"  r="11"  fill="#c4b5a0" opacity="0.11"/>
    {/* Medium drop — far right */}
    <circle cx="390" cy="62"  r="8"   fill="#c4b5a0" opacity="0.10"/>
    {/* Medium drop — right edge mid */}
    <circle cx="388" cy="110" r="7"   fill="#c4b5a0" opacity="0.09"/>
    {/* Small drop — upper far right */}
    <circle cx="376" cy="14"  r="4.5" fill="#c4b5a0" opacity="0.10"/>
    {/* Tiny dot — above main */}
    <circle cx="330" cy="12"  r="3"   fill="#c4b5a0" opacity="0.09"/>
    {/* Small drop — lower right */}
    <circle cx="382" cy="148" r="5.5" fill="#c4b5a0" opacity="0.09"/>
    {/* Tiny dot — lower centre-right */}
    <circle cx="352" cy="168" r="3.5" fill="#c4b5a0" opacity="0.08"/>
    {/* Tiny satellite — far upper */}
    <circle cx="308" cy="8"   r="2.5" fill="#c4b5a0" opacity="0.08"/>
  </svg>
);

/* Splatter 2 — slightly left of card centre, droplets fan outward */
const WatercolorSplash2 = () => (
  <svg
    viewBox="0 0 400 260"
    className="absolute inset-0 w-full h-full pointer-events-none select-none"
    aria-hidden="true"
    preserveAspectRatio="xMidYMid slice"
  >
    {/* Main splatter body */}
    <path
      d="M278,24
         L296,14 L302,30 L320,20 L324,38 L344,28 L342,48
         L360,42 L356,62 L374,60 L370,80 L384,86 L372,96
         L382,108 L364,110 L366,128 L348,122 L346,142
         L326,132 L320,150 L304,136 L294,152 L282,138
         L264,144 L266,126 L248,124 L252,106 L236,100
         L250,88  L234,80  L250,72  L238,58  L256,62
         L252,44  L270,48  L272,30  Z"
      fill="#c4b5a0" opacity="0.12"
    />
    <path
      d="M288,52 L300,44 L306,58 L318,52 L314,68 L326,72
         L316,84 L324,96 L308,94 L306,108 L294,100
         L286,112 L278,100 L266,104 L268,90 L254,88
         L266,78 L256,66 L272,70 Z"
      fill="#c4b5a0" opacity="0.08"
    />
    {/* Separate droplets */}
    <circle cx="358" cy="20"  r="12"  fill="#c4b5a0" opacity="0.11"/>
    <circle cx="382" cy="52"  r="8"   fill="#c4b5a0" opacity="0.10"/>
    <circle cx="386" cy="102" r="7.5" fill="#c4b5a0" opacity="0.09"/>
    <circle cx="370" cy="10"  r="5"   fill="#c4b5a0" opacity="0.10"/>
    <circle cx="322" cy="8"   r="3.5" fill="#c4b5a0" opacity="0.09"/>
    <circle cx="386" cy="148" r="6"   fill="#c4b5a0" opacity="0.09"/>
    <circle cx="360" cy="166" r="4"   fill="#c4b5a0" opacity="0.08"/>
    <circle cx="298" cy="6"   r="2.5" fill="#c4b5a0" opacity="0.08"/>
  </svg>
);

/* Splatter 3 — mirrors card 1 with slight positional variation */
const WatercolorSplash3 = () => (
  <svg
    viewBox="0 0 400 260"
    className="absolute inset-0 w-full h-full pointer-events-none select-none"
    aria-hidden="true"
    preserveAspectRatio="xMidYMid slice"
  >
    {/* Main splatter body */}
    <path
      d="M296,22
         L316,12 L322,28 L340,16 L346,36 L364,26 L360,46
         L378,40 L374,60 L390,66 L380,80 L392,92 L376,96
         L386,112 L368,112 L370,132 L350,124 L348,144
         L328,134 L322,152 L306,140 L298,156 L284,142
         L266,148 L268,130 L250,128 L254,110 L238,104
         L252,92  L236,84  L254,76  L242,62  L260,66
         L256,48  L274,52  L276,34  Z"
      fill="#c4b5a0" opacity="0.13"
    />
    <path
      d="M306,50 L318,42 L322,56 L336,50 L330,66 L344,70
         L332,82 L342,94 L326,94 L324,108 L310,100
         L302,114 L294,102 L280,106 L284,92 L268,88
         L280,78 L270,64 L288,68 Z"
      fill="#c4b5a0" opacity="0.09"
    />
    {/* Separate droplets */}
    <circle cx="374" cy="18"  r="11"  fill="#c4b5a0" opacity="0.11"/>
    <circle cx="394" cy="56"  r="8.5" fill="#c4b5a0" opacity="0.10"/>
    <circle cx="392" cy="106" r="7"   fill="#c4b5a0" opacity="0.09"/>
    <circle cx="384" cy="8"   r="5"   fill="#c4b5a0" opacity="0.10"/>
    <circle cx="338" cy="10"  r="3.5" fill="#c4b5a0" opacity="0.09"/>
    <circle cx="390" cy="152" r="5.5" fill="#c4b5a0" opacity="0.09"/>
    <circle cx="366" cy="170" r="3.5" fill="#c4b5a0" opacity="0.08"/>
    <circle cx="316" cy="6"   r="2.5" fill="#c4b5a0" opacity="0.08"/>
  </svg>
);


/* ════════════════════════════════════════════════════════════════════════════
   ICON BACKGROUND — irregular soft translucent area behind icon
   Deliberately NOT a circle — slightly amoeba-shaped, very low opacity
════════════════════════════════════════════════════════════════════════════ */
const IconBg = () => (
  <svg viewBox="0 0 96 96" className="absolute inset-0 w-full h-full" aria-hidden="true">
    <path
      d="M52,6 C66,2 82,10 88,26 C96,44 90,66 76,78
         C62,90 40,92 26,82 C12,72 6,52 10,36
         C14,20 28,8 44,6 C46,5 50,6 52,6 Z"
      fill="#c68b59" opacity="0.13"
    />
    <path
      d="M58,16 C70,12 82,22 84,36 C88,52 78,68 64,74
         C50,80 32,74 24,62 C16,50 20,32 32,24
         C42,16 50,18 58,16 Z"
      fill="#c68b59" opacity="0.07"
    />
  </svg>
);


/* ════════════════════════════════════════════════════════════════════════════
   CUSTOM HAND-DRAWN SVG ILLUSTRATIONS
   Each is a multi-path line-art illustration using thin strokes (~1.4–1.8px)
   with organic, non-geometric curves that suggest a hand-drawn café style.
════════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════════
   FEATURE DATA
════════════════════════════════════════════════════════════════════════════ */
const FEATURES = [
  {
    id:     "freshly",
    img:    imgFreshly,
    alt:    "Citrus orange slice illustration",
    Splash: WatercolorSplash1,
    label:  "Freshly Squeezed",
    desc:   "Freshly roasted coffee beans crafted daily for bold, smooth flavor.",
  },
  {
    id:     "ethical",
    img:    imgEthical,
    alt:    "Farmer silhouette illustration",
    Splash: WatercolorSplash2,
    label:  "Ethically Sourced",
    desc:   "Ethically sourced ingredients supporting farmers and sustainability.",
  },
  {
    id:     "delivery",
    img:    imgDelivery,
    alt:    "Delivery scooter silhouette illustration",
    Splash: WatercolorSplash3,
    label:  "Fast Delivery",
    desc:   "Fast delivery brings fresh, delicious food and drinks to you.",
  },
];

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATIONS
════════════════════════════════════════════════════════════════════════════ */
const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};
const cardAnim = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

/* ════════════════════════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════════════════════════ */
export default function Features() {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section
      id="orders"
      ref={ref}
      className="py-16 md:py-20 px-6 bg-cream"
      aria-label="Feature highlights"
    >
      <motion.div
        className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6"
        variants={stagger}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
      >
        {FEATURES.map(({ id, img, alt, Splash, label, desc }) => (
          <motion.div
            key={id}
            variants={cardAnim}
            className="relative flex flex-col
                       rounded-card overflow-hidden
                       bg-cream-light border border-cream-dark
                       hover:shadow-card transition-shadow duration-300
                       p-7 pt-8"
          >
            {/* ── Watercolor ink-wash splash — full card, behind everything ── */}
            <Splash />

            {/* ── Icon zone ─────────────────────────────────────────────────
                Irregular soft background (IconBg) sits behind the image.
                Image: fixed w-10 h-10, object-contain, centred via flex,
                CSS filter recolors to palm-brown regardless of source color.
            ─────────────────────────────────────────────────────────────── */}
            <div className="relative z-10 w-24 h-24 mb-6 shrink-0">
              {/* Irregular icon background */}
              <IconBg />
              {/* Custom image icon — centred, uniform size, palm-brown filter */}
              <div className="absolute inset-0 flex items-center justify-center">
                <img
                  src={img}
                  alt={alt}
                  className="w-14 h-14 object-contain"
                  draggable="false"
                />
              </div>
            </div>

            {/* ── Heading ───────────────────────────────────────────────────
                Anton font but NOT compressed: tracking-normal gives it the
                natural wide-ish condensed look from the reference without
                squeezing. font-bold weight for strength.
            ─────────────────────────────────────────────────────────────── */}
            <h3
              className="relative z-10 font-anton uppercase text-palm-brown
                         text-xl leading-tight tracking-normal mb-3"
            >
              {label}
            </h3>

            {/* ── Description ───────────────────────────────────────────── */}
            <p className="relative z-10 font-sans text-sm text-palm-brown/55
                          leading-relaxed max-w-xs">
              {desc}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
