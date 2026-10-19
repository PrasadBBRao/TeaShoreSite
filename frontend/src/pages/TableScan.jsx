/**
 * TableScan.jsx — Entry point for dine-in QR ordering.
 *
 * Route: /table/:qrSecret
 *
 * On mount:
 *   1. Clears any stale QR session from a previous visit.
 *   2. POSTs to /api/qr/scan with the qr_secret from the URL param.
 *   3. On success  → stores session in QRSessionContext (sessionStorage only,
 *                    never in the URL) and navigates to /table/menu.
 *   4. On 409      → shows "Table already in use" message. No token stored.
 *   5. On 404      → shows "Invalid QR code" message.
 *   6. On network  → shows connection error with retry button.
 *
 * Security:
 *   • Uses apiFetchRaw (not apiFetch) so the structured 409 body can be read
 *     without the error-throwing wrapper discarding the detail fields.
 *   • The session_token is stored in sessionStorage only — never in the URL,
 *     localStorage, or React Router navigation state.
 *   • An authenticated user's Bearer token is included if available so the
 *     backend can record started_by_user_id; it is not required.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useQRSession } from "../context/QRSessionContext";
import { apiFetchRaw } from "../lib/api";

const STATE = {
  LOADING:     "loading",
  TABLE_IN_USE: "table_in_use",
  INVALID_QR:  "invalid_qr",
  NETWORK_ERR: "network_error",
  SUCCESS:     "success",
};

export default function TableScan() {
  const { qrSecret }             = useParams();
  const { token: authToken }     = useAuth();
  const { clearSession, setSession } = useQRSession();
  const navigate                 = useNavigate();

  const [state, setState]        = useState(STATE.LOADING);
  const [tableNumber, setTableNumber] = useState(null);
  const [retryCount, setRetryCount]  = useState(0);  // incremented to re-trigger the effect
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    // 1. Discard any previous session before starting a new scan
    clearSession();

    (async () => {
      const headers = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const { ok, status, body } = await apiFetchRaw("/qr/scan", {
        method: "POST",
        body:   JSON.stringify({ qr_secret: qrSecret }),
        headers,
      });

      if (ok && body?.session_token) {
        // 3. Success — store in sessionStorage via context
        setSession({
          sessionId:    body.session_id,
          sessionToken: body.session_token,   // never exposed in URL
          tableId:      body.table_id,
          tableNumber:  body.table_number,
        });
        // Navigate immediately; don't linger on the scan page
        navigate("/table/menu", { replace: true });
        return;
      }

      if (status === 409) {
        // 4. Table already occupied — body.detail is TableInUseResponse
        setTableNumber(body?.detail?.table_number ?? null);
        setState(STATE.TABLE_IN_USE);
        return;
      }

      if (status === 404) {
        setState(STATE.INVALID_QR);
        return;
      }

      // Network failure or unexpected error
      setState(STATE.NETWORK_ERR);
    })();
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Retry handler (network error only) ────────────────────────────────
  function handleRetry() {
    didRun.current = false;
    setState(STATE.LOADING);
    setRetryCount((n) => n + 1);  // triggers the effect to re-run
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-sm">

        {state === STATE.LOADING && (
          <div className="text-center">
            <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full
                            border-4 border-cream-dark border-t-palm-brown" />
            <p className="font-sans text-sm text-palm-brown/60">
              Connecting to your table…
            </p>
          </div>
        )}

        {state === STATE.TABLE_IN_USE && (
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-center shadow-card">
            <span className="text-4xl" aria-hidden="true">🪑</span>
            <h1 className="mt-4 font-serif text-2xl font-semibold text-palm-brown">
              Table{tableNumber ? ` ${tableNumber}` : ""} is currently in use
            </h1>
            <p className="mt-3 font-sans text-sm text-palm-brown/70 leading-relaxed">
              This table already has an active session.
              Please ask a staff member for assistance.
            </p>
            <p className="mt-5 font-sans text-xs text-palm-brown/40">
              If you believe this is an error, a staff member can reset the table for you.
            </p>
          </div>
        )}

        {state === STATE.INVALID_QR && (
          <div className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-center shadow-card">
            <span className="text-4xl" aria-hidden="true">❌</span>
            <h1 className="mt-4 font-serif text-2xl font-semibold text-palm-brown">
              QR code not recognised
            </h1>
            <p className="mt-3 font-sans text-sm text-palm-brown/70 leading-relaxed">
              This QR code is not valid. Please scan the correct table QR code
              or ask a staff member for help.
            </p>
          </div>
        )}

        {state === STATE.NETWORK_ERR && (
          <div className="rounded-[2rem] border border-cream-dark bg-cream-light p-8 text-center shadow-card">
            <span className="text-4xl" aria-hidden="true">📶</span>
            <h1 className="mt-4 font-serif text-2xl font-semibold text-palm-brown">
              Connection error
            </h1>
            <p className="mt-3 font-sans text-sm text-palm-brown/70 leading-relaxed">
              Could not reach the server. Please check your signal and try again.
            </p>
            <button
              onClick={handleRetry}
              className="mt-6 rounded-full bg-palm-brown px-6 py-3 font-sans text-sm
                         font-semibold text-cream hover:bg-amber-accent transition-colors"
            >
              Try again
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
