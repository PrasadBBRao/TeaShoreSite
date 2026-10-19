import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";

const TESTIMONIALS = [
  {
    name:    "Aanya S.",
    handle:  "@aanya.sips",
    stars:   5,
    text:    "Honestly the iced masala chai here hits different. I've been coming every single day — it's become my situationship at this point. 10/10 no notes.",
    avatar:  "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&q=80&auto=format&fit=crop&crop=face",
  },
  {
    name:    "Rohan M.",
    handle:  "@rohan.lifts",
    stars:   5,
    text:    "The mango protein shake is genuinely the best post-gym drink I've found in the city. High protein, not too sweet, and the QR ordering is so smooth.",
    avatar:  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80&auto=format&fit=crop&crop=face",
  },
  {
    name:    "Priya K.",
    handle:  "@priya.eats",
    stars:   5,
    text:    "Finally a café that gets it — healthy doesn't have to be boring or expensive. The avocado toast is perfect and the vibe is immaculate. Obsessed.",
    avatar:  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&q=80&auto=format&fit=crop&crop=face",
  },
  {
    name:    "Nikhil P.",
    handle:  "@nikhil.nourished",
    stars:   5,
    text:    "The matcha cold brew is my daily reset button. And the protein waffle? Actually insane. Super fresh, super satisfying, and the whole place feels low-key vibey.",
    avatar:  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80&auto=format&fit=crop&crop=face",
  },
  {
    name:    "Zara T.",
    handle:  "@zara.zest",
    stars:   5,
    text:    "I came for the chai and stayed for the options. The spinach feta wrap is so good and the oat milk lattes are genuinely creamy without tasting fake. Love this spot.",
    avatar:  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80&auto=format&fit=crop&crop=face",
  },
  {
    name:    "Meher A.",
    handle:  "@meher.mornings",
    stars:   5,
    text:    "This is my post-workout go-to. The mango protein shake hits perfectly and the banana oat smoothie tastes like a treat but feels clean. The staff are always so nice too.",
    avatar:  "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=120&q=80&auto=format&fit=crop&crop=face",
  },
];

const duplicatedTestimonials = [...TESTIMONIALS, ...TESTIMONIALS];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};

const card = {
  hidden:  { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

export default function Testimonials() {
  const ref = useRef(null);
  const trackRef = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [trackOffset, setTrackOffset] = useState(0);
  const dragStartXRef = useRef(0);
  const dragOriginRef = useRef(0);
  const rafIdRef = useRef(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const cycleWidth = track.scrollWidth / 2;

    const tick = () => {
      if (!isPaused && !isDragging) {
        setTrackOffset((current) => {
          let next = current - 1.2;

          if (next <= -cycleWidth) {
            next += cycleWidth;
          }

          if (next > 0) {
            next -= cycleWidth;
          }

          return next;
        });
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafIdRef.current);
  }, [isDragging, isPaused]);

  const handlePointerDown = (event) => {
    if (!trackRef.current) return;

    setIsPaused(true);
    setIsDragging(true);
    dragStartXRef.current = event.clientX;
    dragOriginRef.current = trackOffset;
    event.preventDefault();

    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event) => {
    if (!isDragging) return;

    const delta = event.clientX - dragStartXRef.current;
    setTrackOffset(dragOriginRef.current + delta);
  };

  const handlePointerUp = (event) => {
    setIsDragging(false);
    setIsPaused(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event) => {
    setIsDragging(false);
    setIsPaused(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      ref={ref}
      className="py-20 md:py-28 px-6 bg-cream-light"
      aria-label="Customer testimonials"
    >
      <div className="max-w-7xl mx-auto">

        <motion.div
          className="text-center mb-12 flex flex-col items-center gap-3"
          variants={stagger}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
        >
          <motion.span
            variants={fadeUp}
            className="font-sans text-sm font-semibold tracking-widest uppercase text-amber-accent"
          >
            Real Reviews
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="font-anton uppercase text-palm-brown
                       text-[clamp(1.8rem,4vw,3rem)] leading-none tracking-tight"
          >
            What Our Customers Say
          </motion.h2>
          <motion.div
            variants={fadeUp}
            className="flex items-center gap-1.5 text-amber-accent text-xl mt-1"
            aria-label="Average 4.9 stars"
          >
            {"★★★★★".split("").map((s, i) => (
              <span key={i} aria-hidden="true">{s}</span>
            ))}
            <span className="font-sans text-sm font-semibold text-palm-brown/60 ml-1">4.9 / 5</span>
          </motion.div>
        </motion.div>

        <motion.div
          className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
          onPointerEnter={() => !isDragging && setIsPaused(true)}
          onPointerLeave={() => !isDragging && setIsPaused(false)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={stagger}
          style={{ touchAction: "pan-y", userSelect: "none", cursor: isDragging ? "grabbing" : "grab" }}
        >
          <motion.div
            ref={trackRef}
            className="marquee-track flex w-max gap-5"
            style={{
              transform: `translate3d(${trackOffset}px, 0, 0)`,
              transition: isDragging ? "none" : "transform 0.08s linear",
              willChange: "transform",
            }}
            aria-label="Customer review carousel"
          >
            {duplicatedTestimonials.map(({ name, handle, stars, text, avatar }, i) => {
              const isDark = i % 2 === 1;

              return (
                <motion.article
                  key={`${name}-${i}`}
                  variants={card}
                  whileHover={{ y: -5, transition: { duration: 0.22 } }}
                  className={[
                    "rounded-card p-7 flex-shrink-0 flex flex-col gap-5 transition-shadow duration-300 w-[320px] md:w-[360px]",
                    isDark
                      ? "bg-palm-brown shadow-card-hover"
                      : "bg-cream border border-cream-dark hover:shadow-card",
                  ].join(" ")}
                >
                  <div className="flex gap-1 text-amber-accent text-base" aria-label={`${stars} stars`}>
                    {"★".repeat(stars).split("").map((s, index) => (
                      <span key={`${name}-star-${index}`} aria-hidden="true">{s}</span>
                    ))}
                  </div>

                  <p
                    className={[
                      "font-sans text-sm leading-relaxed flex-1",
                      isDark ? "text-cream/85" : "text-palm-brown/75",
                    ].join(" ")}
                  >
                    "{text}"
                  </p>

                  <div className="flex items-center gap-3 mt-auto pt-4 border-t border-current/10">
                    <img
                      src={avatar}
                      alt={name}
                      className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-amber-accent/30"
                      loading="lazy"
                    />
                    <div>
                      <p
                        className={[
                          "font-sans text-sm font-semibold leading-none",
                          isDark ? "text-cream" : "text-palm-brown",
                        ].join(" ")}
                      >
                        {name}
                      </p>
                      <p
                        className={[
                          "font-sans text-xs mt-1",
                          isDark ? "text-cream/50" : "text-palm-brown/40",
                        ].join(" ")}
                      >
                        {handle}
                      </p>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
