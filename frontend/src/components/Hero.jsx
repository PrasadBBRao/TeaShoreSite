import { Link } from "react-router-dom";

import logo from "../assets/favicon.png";
import heroDesktop from "../assets/hero-chai-desktop.png.jpeg";
import heroMobile from "../assets/hero-chai-mobile.PNG";
import { useAuth } from "../context/AuthContext";

/* ── Mobile layout notes for hero-chai-mobile.JPEG (9:16 portrait)
   Container is exactly 100svh on mobile — image covers full screen.
   object-cover object-top fills the viewport with no letterbox.
   bg-palm-brown-dark is only a fallback while the image loads.

  Buttons sit at top-[84%] — below the tagline, above the bottom nav.
   Bottom nav is fixed at ~88px so buttons are always visible.

   Desktop: lg:min-h-screen, object-cover object-center, bottom-14 left-10.
────────────────────────────────────────────────────────────────────────── */

const BASE =
  /* Mobile-first: compact */
  "inline-flex items-center justify-center rounded-full " +
  "font-sans font-semibold tracking-widest uppercase leading-none whitespace-nowrap shrink-0 " +
  "h-8 px-5 text-xs " +
  /* Desktop override: original size */
  "lg:h-11 lg:px-8 lg:text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60";

const LOGIN_CLS  = `${BASE} border border-cream/60 text-cream hover:bg-cream/10 hover:border-cream transition-colors duration-200`;
const SIGNUP_CLS = `${BASE} bg-cream text-palm-brown shadow-md hover:bg-cream-light transition-colors duration-200`;

/* eslint-disable-next-line react/prop-types */
export default function Hero({ onLogoClick }) {
  const { user } = useAuth();
  return (
    <section
      id="home"
      className="relative w-full bg-palm-brown-dark overflow-hidden"
      aria-label="Hero"
    >
      <div
        className="relative w-full
                   h-[100svh]
                   lg:h-auto lg:min-h-screen"
      >
        <Link
          to="/"
          aria-label="Teashore home"
          onClick={onLogoClick}
          className="absolute z-20 top-5 left-5 md:hidden"
        >
          <img
            src={logo}
            alt="Teashore"
            className="h-12 w-12 rounded-full object-contain md:h-16 md:w-16"
            draggable="false"
          />
        </Link>

        {/* Full-bleed image — contains on mobile, covers on desktop */}
        <picture className="absolute inset-0 w-full h-full" aria-hidden="true">
          <source media="(min-width: 1024px)" srcSet={heroDesktop} type="image/jpeg" />
          <img
            src={heroMobile}
            alt="Chai Time, Any Time — Teashore hero"
            className="w-full h-full
                       object-cover object-top
                       lg:object-cover lg:object-center"
            draggable="false"
            loading="eager"
            fetchPriority="high"
          />
        </picture>

        {/* Vignette */}
        <div
          className="absolute inset-x-0 bottom-0 h-[20%] lg:h-44 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(46,31,21,0.82) 0%, rgba(46,31,21,0) 100%)",
          }}
          aria-hidden="true"
        />

        {/* Auth buttons — hidden once logged in */}
        {!user && (
          <div
            className="absolute z-10
                       top-[84%] inset-x-0 flex items-center justify-center gap-2
                       lg:top-auto lg:right-auto lg:bottom-14 lg:left-10 lg:translate-x-0 lg:justify-start lg:gap-4"
            role="group"
            aria-label="Account actions"
          >
            <Link to="/login"  className={LOGIN_CLS}>Login</Link>
            <Link to="/signup" className={SIGNUP_CLS}>Sign Up</Link>
          </div>
        )}
      </div>
    </section>
  );
}
