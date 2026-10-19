import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/favicon.png";

/* ── Nav items: same-page sections on the home page, dedicated pages otherwise. */
const NAV_ITEMS = [
  { label: "Home",        to: "/",              sectionId: "home"        },
  { label: "Menu",        to: "/#menu",         sectionId: "menu"        },
  { label: "Orders",      to: "/orders",        sectionId: null,  external: true },
  { label: "Reservation", to: "/reservation",   sectionId: null, external: true },
  { label: "About",       to: "/#about",        sectionId: "about"       },
  { label: "Help",        to: "/#contact",      sectionId: "contact"     },
];

const SECTION_IDS = NAV_ITEMS.filter((i) => i.sectionId).map((item) => item.sectionId);

const SECTION_LABELS = Object.fromEntries(
  NAV_ITEMS.filter((i) => i.sectionId).map((item) => [item.sectionId, item.label])
);

const HOME_PATHS = new Set(["/", "/menu", "/about"]);

/** Pixels from viewport top — section tops at or above this line become candidates. */
const SCROLL_OFFSET = 100;

const ROUTE_LABELS = {
  "/orders": "Orders",
  "/reservation": "Reservation",
  "/contact": "Help",
};

function resolveSectionFromScroll() {
  let currentId = SECTION_IDS[0];

  for (const id of SECTION_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;

    if (el.getBoundingClientRect().top <= SCROLL_OFFSET) {
      currentId = id;
    }
  }

  const nearBottom =
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 2;

  if (nearBottom) {
    currentId = SECTION_IDS[SECTION_IDS.length - 1];
  }

  return SECTION_LABELS[currentId];
}

function hasReachedSection(sectionId) {
  if (isSectionInActiveZone(sectionId)) return true;

  const isLastSection = sectionId === SECTION_IDS[SECTION_IDS.length - 1];
  if (!isLastSection) return false;

  return (
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 2
  );
}

function isSectionInActiveZone(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return false;

  const { top, bottom } = el.getBoundingClientRect();
  return top <= SCROLL_OFFSET && bottom > SCROLL_OFFSET;
}

/* ── Shared text style ─────────────────────────────────────────────────── */
// flex (block-level) + items-center ensures the fixed h-7 height is honoured
// exactly and the active pill fills it symmetrically on all browsers.
const labelCls =
  "flex items-center justify-center " +
  "font-sans font-semibold text-xs tracking-widest uppercase leading-none " +
  "whitespace-nowrap select-none";

// Fixed height applied to every desktop pill item — keeps vertical rhythm
// identical for all labels regardless of text length.
const ITEM_H = "h-7"; // 28px — snug but evenly padded

/* ── Color themes ──────────────────────────────────────────────────────────
   "dark"  = default: cream navbar container, palm-brown active pill (Home/SignUp pages)
   "light" = inverted: palm-brown navbar container, cream active pill (Login page)
─────────────────────────────────────────────────────────────────────────── */
const THEMES = {
  dark: {
    navBg:           "bg-cream border-cream-dark/50",
    linkInactive:    "text-palm-brown/75 hover:text-palm-brown",
    activePillBg:    "bg-palm-brown",
    activePillRing:  "",
    activeText:      "text-cream",
    dropdownBg:      "bg-cream border-cream-dark/50",
    mobileInactive:  "text-palm-brown/75 hover:text-palm-brown hover:bg-cream-dark",
    mobileActive:    "bg-palm-brown text-cream",
    hamburgerColor:  "bg-cream",
  },
  light: {
    navBg:           "bg-palm-brown border-palm-brown-light/40",
    linkInactive:    "text-cream/75 hover:text-cream",
    activePillBg:    "bg-cream",
    activePillRing:  "",
    activeText:      "text-palm-brown",
    dropdownBg:      "bg-palm-brown border-palm-brown-light/40",
    mobileInactive:  "text-cream/75 hover:text-cream hover:bg-palm-brown-light",
    mobileActive:    "bg-cream text-palm-brown",
    hamburgerColor:  "bg-palm-brown",
  },
};

/* ── Auth: derive initials from name ───────────────────────────────────── */
function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/* ── Desktop user pill + dropdown ──────────────────────────────────────── */
function UserMenu({ user, onLogout, theme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initials   = getInitials(user.name);
  const firstName  = user.name.split(" ")[0];

  // On cream navbar (dark theme): avatar is palm-brown bg + cream text
  // On brown navbar (light theme): avatar is cream bg + palm-brown text
  const isDark = theme.navBg.includes("bg-cream");
  const accountBg  = isDark ? "bg-cream" : "bg-palm-brown";
  const accountBorder = isDark ? "border-cream-dark" : "border-palm-brown-light/50";
  const avatarBg   = isDark ? "bg-palm-brown"  : "bg-cream";
  const avatarText = isDark ? "text-cream"      : "text-palm-brown";
  const nameText   = isDark ? "text-palm-brown" : "text-cream";

  return (
    <div ref={ref} className="relative pointer-events-auto">
      {/* Trigger pill — exact same height/shadow as the nav pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className={[
          "flex items-center gap-2 rounded-full border pl-1.5 pr-3 h-10 py-0",
          "font-poppins font-semibold text-sm leading-none",
          "transition-colors duration-200 select-none shrink-0",
          "shadow-[0_4px_28px_rgba(0,0,0,0.22)]",
          accountBg, accountBorder,
        ].join(" ")}
      >
        {/* Avatar — w-7 h-7 so it sits comfortably inside h-10 */}
        <span
          className={[
            "flex items-center justify-center rounded-full w-7 h-7 shrink-0",
            "text-[11px] font-bold",
            avatarBg, avatarText,
          ].join(" ")}
          aria-hidden="true"
        >
          {initials}
        </span>

        <span className={nameText}>{firstName}</span>

        {/* Chevron */}
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={[
            "w-3 h-3 shrink-0 transition-transform duration-200",
            isDark ? "text-palm-brown" : "text-cream",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {/* Dropdown — always cream bg with palm-brown text (matches reference image) */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-[calc(100%+8px)] w-52 z-50
                       rounded-2xl border border-cream-dark
                       bg-cream
                       shadow-[0_8px_32px_rgba(74,51,37,0.22)] overflow-hidden"
          >
            {/* User info row */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-cream-dark">
              {/* Avatar */}
              <span className="flex items-center justify-center rounded-full w-9 h-9 shrink-0
                               bg-palm-brown text-cream text-sm font-bold font-poppins">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="font-poppins font-semibold text-sm text-palm-brown truncate">
                  {user.name}
                </p>
                <p className="font-sans text-xs text-palm-brown/50 truncate mt-0.5">
                  {user.mobile_number}
                </p>
              </div>
            </div>

            {/* Account actions */}
            <div className="p-2">
              <NavLink
                to="/orders"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 font-poppins text-sm font-semibold text-palm-brown hover:bg-cream-light transition-colors"
              >
                My Orders
              </NavLink>
              <NavLink
                to="/my-reservations"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 font-poppins text-sm font-semibold text-palm-brown hover:bg-cream-light transition-colors"
              >
                My Reservations
              </NavLink>
              <NavLink
                to="/profile"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 font-poppins text-sm font-semibold text-palm-brown hover:bg-cream-light transition-colors"
              >
                My Profile
              </NavLink>
            </div>
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 border-t border-cream-dark px-5 py-3.5
                         font-poppins font-semibold text-sm text-red-600 hover:bg-red-50
                         transition-colors duration-150"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                   className="w-4 h-4 shrink-0" aria-hidden="true">
                <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"/>
              </svg>
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Desktop item ──────────────────────────────────────────────────────── */
function DesktopItem({ label, to, isActive, onClick, theme }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={[
        "relative px-4 py-0 rounded-full transition-colors duration-200",
        ITEM_H,
        labelCls,
        isActive ? theme.activeText : theme.linkInactive,
      ].join(" ")}
    >
      {isActive && (
        <motion.span
          layoutId="nav-active-pill"
          aria-hidden="true"
          className={[
            "absolute inset-0 z-0 rounded-full pointer-events-none transition-colors duration-300",
            theme.activePillBg,
            theme.activePillRing,
          ].join(" ")}
          transition={{ type: "spring", stiffness: 500, damping: 38 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </NavLink>
  );
}

/* ── Desktop nav with sliding pill ────────────────────────────────────── */
function DesktopNav({ items, computeActive, handleNavClick, theme }) {
  return (
    <LayoutGroup id="teashore-main-navigation">
      <nav
        className={[
          "pointer-events-auto relative",
          "flex items-center gap-0.5",
          "shadow-[0_4px_28px_rgba(0,0,0,0.22)]",
          "rounded-full px-2 h-10 transition-colors duration-300",
          "border",
          theme.navBg,
        ].join(" ")}
        aria-label="Main navigation"
      >
        {items.map((item) => (
          <DesktopItem
            key={item.label}
            label={item.label}
            to={item.to}
            isActive={computeActive(item.label)}
            onClick={handleNavClick(item)}
            theme={theme}
          />
        ))}
      </nav>
    </LayoutGroup>
  );
}

/* ── Mobile item ───────────────────────────────────────────────────────── */
function MobileItem({ label, to, isActive, onClick, theme }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={[
        "block w-full px-5 py-3 rounded-full",
        "font-sans font-semibold text-sm tracking-widest uppercase",
        "transition-colors duration-200",
        isActive ? theme.mobileActive : theme.mobileInactive,
      ].join(" ")}
    >
      {label}
    </NavLink>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */
/* eslint-disable-next-line react/prop-types */
export default function Navbar({ variant = "dark", onLogoClick }) {
  const theme = THEMES[variant] ?? THEMES.dark;

  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("Home");

  const { user, loading: authLoading, logout } = useAuth();

  const handleLogout = useCallback(() => {
    logout();
    navigate("/", { replace: true });
  }, [logout, navigate]);

  const scrollLockRef = useRef(null);
  const rafRef = useRef(null);
  const scrollUnlockTimerRef = useRef(null);

  const isHomePage = HOME_PATHS.has(location.pathname);

  const beginScrollLock = useCallback((sectionId) => {
    scrollLockRef.current = sectionId;
    setActiveSection(SECTION_LABELS[sectionId]);

    window.clearTimeout(scrollUnlockTimerRef.current);
    scrollUnlockTimerRef.current = window.setTimeout(() => {
      scrollLockRef.current = null;
    }, 900);
  }, []);

  const syncActiveFromScroll = useCallback(() => {
    const lockedId = scrollLockRef.current;

    if (lockedId) {
      if (hasReachedSection(lockedId)) {
        scrollLockRef.current = null;
        window.clearTimeout(scrollUnlockTimerRef.current);
      } else {
        return;
      }
    }

    setActiveSection(resolveSectionFromScroll());
  }, []);

  const handleNavClick = useCallback(
    (item) => (event) => {
      setOpen(false);

      // External routes (e.g. /orders) navigate normally — no scroll logic
      if (item.external) {
        event.preventDefault();
        setActiveSection(item.label);
        navigate(item.to);
        return;
      }

      beginScrollLock(item.sectionId);

      if (isHomePage) {
        event.preventDefault();

        const nextUrl = item.to === "/" ? "/" : item.to;
        window.history.pushState(null, "", nextUrl);

        const target = document.getElementById(item.sectionId);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (item.sectionId === "home") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    },
    [beginScrollLock, isHomePage, navigate]
  );

  /* Route-based active state for standalone pages. */
  useEffect(() => {
    if (isHomePage) return;

    scrollLockRef.current = null;
  }, [isHomePage, location.pathname]);

  /* Hash navigation arriving from another route — lock until destination is reached. */
  useEffect(() => {
    if (!isHomePage || !location.hash) return;

    const sectionId = location.hash.slice(1);
    if (!SECTION_LABELS[sectionId]) return;

    beginScrollLock(sectionId);
  }, [beginScrollLock, isHomePage, location.hash]);

  /* Single scroll listener for home-page section detection. */
  useEffect(() => {
    if (!isHomePage) return;

    const onScroll = () => {
      if (rafRef.current !== null) return;

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        syncActiveFromScroll();
      });
    };

    syncActiveFromScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      window.clearTimeout(scrollUnlockTimerRef.current);
    };
  }, [isHomePage, syncActiveFromScroll]);

  const routeActiveSection = ROUTE_LABELS[location.pathname] ?? "Home";
  const displayedActiveSection = isHomePage ? activeSection : routeActiveSection;
  const computeActive = (label) => label === displayedActiveSection;

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 pointer-events-none"
      role="banner"
    >
      {/* ── DESKTOP ─────────────────────────────────────────────────── */}
      <div className="hidden md:block relative pt-5 px-5">

        <NavLink
          to="/"
          aria-label="Teashore home"
          onClick={onLogoClick}
          className="pointer-events-auto absolute left-5 top-[6px]"
        >
          <img
            src={logo}
            alt="Teashore"
            className="h-[68px] w-[68px] rounded-full object-contain"
            draggable="false"
          />
        </NavLink>

        {/* Nav pill — centred, contains ONLY nav links, never auth */}
        <div className="flex justify-center">
          <DesktopNav
            items={NAV_ITEMS}
            computeActive={computeActive}
            handleNavClick={handleNavClick}
            theme={theme}
          />
        </div>

        {/* Auth widget — absolutely pinned to the far-right edge, only when logged in */}
        <div className="pointer-events-auto absolute top-5 right-5">
          {user && (
            <UserMenu user={user} onLogout={handleLogout} theme={theme} />
          )}
        </div>
      </div>

      {/* ── MOBILE — bare hamburger, top-right, no background ───────── */}
      <div className="md:hidden pointer-events-auto absolute top-5 right-5">

        {/* Single mobile toggle — same header position in both states */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="relative w-10 h-10 flex items-center justify-center
                     cursor-pointer
                     focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-cream/60 rounded-full"
        >
          {!open ? (
            <motion.div
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="relative flex h-6 w-6 flex-col items-center justify-center gap-[6px]"
            >
              <span className={`block h-[2px] w-6 rounded-full ${theme.hamburgerColor}`} />
              <span className={`block h-[2px] w-6 rounded-full ${theme.hamburgerColor}`} />
              <span className={`block h-[2px] w-6 rounded-full ${theme.hamburgerColor}`} />
            </motion.div>
          ) : (
            <motion.div
              key="close-icon"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-6 w-6"
              aria-hidden="true"
            >
              <span className={`absolute left-1/2 top-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 rounded-full ${theme.hamburgerColor} rotate-45`} />
              <span className={`absolute left-1/2 top-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 rounded-full ${theme.hamburgerColor} -rotate-45`} />
            </motion.div>
          )}
        </button>
      </div>

      {/* Dropdown panel — anchored independently so the toggle keeps its header position */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -10, scale: 0.95, originX: 1, originY: 0 }}
            animate={{ opacity: 1, y: 0,   scale: 1 }}
            exit={{    opacity: 0, y: -8,   scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={[
              "md:hidden pointer-events-auto absolute top-14 right-5 w-52",
              "rounded-2xl",
              "shadow-[0_8px_32px_rgba(0,0,0,0.28)]",
              "border overflow-hidden",
              theme.dropdownBg,
            ].join(" ")}
          >
            <ul className="flex flex-col p-2 gap-0.5" role="list">
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <MobileItem
                    label={item.label}
                    to={item.to}
                    isActive={computeActive(item.label)}
                    onClick={handleNavClick(item)}
                    theme={theme}
                  />
                </li>
              ))}

              {/* ── Mobile auth section ── */}
              {authLoading ? (
                <li className="px-5 py-3" aria-label="Checking account session">
                  <div className="h-10 rounded-xl bg-current/10 animate-pulse" />
                </li>
              ) : user ? (
                <>
                  {/* Divider */}
                  <li aria-hidden="true">
                    <div className={["my-1 h-px mx-2", theme.navBg.includes("cream") ? "bg-cream-dark/50" : "bg-palm-brown-light/30"].join(" ")} />
                  </li>
                  {/* Authenticated actions */}
                  <li>
                    <NavLink to="/orders" onClick={() => setOpen(false)} className={["block w-full px-5 py-3 rounded-full font-poppins font-semibold text-sm transition-colors duration-200", theme.mobileInactive].join(" ")}>My Orders</NavLink>
                  </li>
                  <li>
                    <NavLink to="/my-reservations" onClick={() => setOpen(false)} className={["block w-full px-5 py-3 rounded-full font-poppins font-semibold text-sm transition-colors duration-200", theme.mobileInactive].join(" ")}>My Reservations</NavLink>
                  </li>
                  <li>
                    <NavLink to="/profile" onClick={() => setOpen(false)} className={["block w-full px-5 py-3 rounded-full font-poppins font-semibold text-sm transition-colors duration-200", theme.mobileInactive].join(" ")}>My Profile</NavLink>
                  </li>
                  <li>
                    <button
                      onClick={() => { setOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-5 py-3 rounded-full
                                 font-poppins font-semibold text-sm
                                 text-red-500 hover:bg-red-50/10 transition-colors duration-150"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                        <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"/>
                      </svg>
                      Logout
                    </button>
                  </li>
                  {/* User identity at the bottom of the authenticated section */}
                  <li aria-hidden="true">
                    <div className={["my-1 h-px mx-2", theme.navBg.includes("cream") ? "bg-cream-dark/50" : "bg-palm-brown-light/30"].join(" ")} />
                  </li>
                  <li>
                    <div className="flex items-center gap-3 px-5 py-3">
                      <span className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold font-poppins", theme.navBg.includes("cream") ? "bg-palm-brown text-cream" : "bg-cream text-palm-brown"].join(" ")}>
                        {getInitials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className={["font-poppins font-semibold text-sm truncate", theme.navBg.includes("cream") ? "text-palm-brown" : "text-cream"].join(" ")}>
                          {user.name}
                        </p>
                        <p className={["font-sans text-xs truncate mt-0.5", theme.navBg.includes("cream") ? "text-palm-brown/50" : "text-cream/50"].join(" ")}>
                          {user.mobile_number}
                        </p>
                      </div>
                    </div>
                  </li>
                </>
              ) : (
                <>
                  <li aria-hidden="true">
                    <div className={["my-1 h-px mx-2", theme.navBg.includes("cream") ? "bg-cream-dark/50" : "bg-palm-brown-light/30"].join(" ")} />
                  </li>
                  <li>
                    <MobileItem label="Login"   to="/login"  isActive={false} onClick={() => setOpen(false)} theme={theme} />
                  </li>
                  <li>
                    <MobileItem label="Sign Up" to="/signup" isActive={false} onClick={() => setOpen(false)} theme={theme} />
                  </li>
                </>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
