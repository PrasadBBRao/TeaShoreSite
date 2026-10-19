import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "motion/react";

const fadeUp = {
  hidden:  { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.18, delayChildren: 0.1 } },
};

export default function About() {
  const ref   = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      id="about"
      ref={ref}
      className="py-24 px-6 bg-palm-brown"
      aria-label="About Teashore"
    >
      <motion.div
        className="max-w-3xl mx-auto text-center flex flex-col items-center gap-8"
        variants={stagger}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
      >
        {/* Eyebrow label */}
        <motion.span
          variants={fadeUp}
          className="inline-block font-sans text-sm font-semibold tracking-widest
                     uppercase text-amber-accent"
        >
          About Us
        </motion.span>

        {/* Heading — Anton, all-caps, matches "Explore Our Menu" style */}
        <motion.h2
          variants={fadeUp}
          className="font-anton uppercase text-cream tracking-normal leading-tight
                     text-[clamp(2rem,6vw,3.5rem)]"
        >
          <span className="block whitespace-nowrap">
            Chai for the <span className="text-amber-accent-dark">soul</span>.
          </span>
          <span className="block whitespace-nowrap">
            Food for the <span className="text-amber-accent-dark">body</span>.
          </span>
        </motion.h2>

        {/* Divider */}
        <motion.div
          variants={fadeUp}
          className="h-px w-16 rounded-full bg-amber-accent/50"
          aria-hidden="true"
        />

        {/* Body copy */}
        <motion.div
          variants={stagger}
          className="flex flex-col gap-4 text-cream/80 font-sans text-base md:text-lg leading-relaxed"
        >
          <motion.p variants={fadeUp}>
            Teashore is a Gen Z-friendly café where every sip and bite is crafted
            with real ingredients, zero pretence, and maximum flavour. Think
            classic chai, bold coffees, refreshing cold brews, and healthy bites
            that actually hit — all in a space designed for people who care about
            what they eat and drink without making it a whole personality.
          </motion.p>
          <motion.p variants={fadeUp}>
            We source locally, keep the menu seasonal, and believe that healthy
            food should feel like a treat — not a punishment. Whether you&apos;re
            here to catch up with friends, clock in some focus hours, or just
            exist with a warm cup, Teashore is your place.
          </motion.p>
          <motion.p variants={fadeUp}>
            Come for the chai. Stay for the vibes.
          </motion.p>
        </motion.div>

        {/* Secondary CTA */}
        <motion.div variants={fadeUp}>
          <Link
            to="/reservation"
            className="inline-flex items-center justify-center rounded-full
                       border border-cream bg-transparent text-cream
                       shadow-md h-8 px-4 text-xs font-sans font-semibold tracking-widest uppercase
                       whitespace-nowrap shrink-0 transition-colors duration-300
                       hover:bg-cream hover:text-palm-brown focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-cream/60
                       lg:h-11 lg:px-7 lg:text-sm"
          >
            Reserve a Spot
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
