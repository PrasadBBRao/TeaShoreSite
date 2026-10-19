import logo from "../assets/favicon.png";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      id="contact"
      className="bg-palm-brown-dark border-t border-palm-brown py-10 px-6"
      aria-label="Site footer"
    >
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-4 text-center">

        <img
          src={logo}
          alt="Teashore"
          className="h-16 w-16 rounded-full object-contain"
          draggable="false"
        />

        {/* Tagline */}
        <p className="font-sans text-[0.7rem] sm:text-xs md:text-sm font-medium uppercase tracking-[0.22em] text-amber-accent/80 leading-none whitespace-nowrap">
          Sip. Snack. Stay Fit.
        </p>

        {/* Divider */}
        <div className="h-px w-12 rounded-full bg-amber-accent/30" aria-hidden="true" />

        {/* Copyright */}
        <p className="font-sans text-xs text-cream/40">
          © {year} Teashore. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
