/**
 * Generic placeholder page — used for routes that aren't built yet.
 * Receives a `title` prop so each route gets its own label.
 */
import { Link } from "react-router-dom";

export default function Placeholder({ title = "Coming Soon" }) {
  return (
    <>
      <main className="min-h-screen bg-palm-brown-dark flex flex-col items-center justify-center gap-6 px-6">
        <p className="font-sans text-xs tracking-widest uppercase text-amber-accent">
          Teashore
        </p>
        <h1 className="font-serif font-bold text-cream text-4xl md:text-6xl text-center">
          {title}
        </h1>
        <p className="font-sans text-cream/50 text-base text-center max-w-xs">
          This page is under construction. Check back soon.
        </p>
        <Link
          to="/"
          className="btn-primary mt-2"
        >
          ← Back to Home
        </Link>
      </main>
    </>
  );
}
