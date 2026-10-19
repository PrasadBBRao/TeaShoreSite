import { useCallback, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import Navbar          from "./components/Navbar";
import MobileBottomNav from "./components/MobileBottomNav";
import Hero            from "./components/Hero";
import MenuPreview     from "./components/MenuPreview";
import Features        from "./components/Features";
import PromoBlock      from "./components/PromoBlock";
import Testimonials    from "./components/Testimonials";
import About           from "./components/About";
import Footer          from "./components/Footer";
import Login           from "./pages/Login";
import SignUp          from "./pages/SignUp";
import Cart            from "./pages/Cart";
import Checkout        from "./pages/Checkout";
import Orders          from "./pages/Orders";
import MyReservations  from "./pages/MyReservations";
import Reservation     from "./pages/Reservation";
import Profile         from "./pages/Profile";
import Placeholder     from "./pages/Placeholder";
import TableScan       from "./pages/TableScan";
import CounterMenu     from "./pages/CounterMenu";
import { AuthProvider, useAuth }     from "./context/AuthContext";
import { CartProvider, useCart }     from "./context/CartContext";
import { ToastProvider }             from "./context/ToastContext";
import { QRSessionProvider }         from "./context/QRSessionContext";
import ToastStack from "./components/Toast";

/* ── Admin imports ─────────────────────────────────────────────────── */
import { AdminAuthProvider } from "./admin/context/AdminAuthContext";
import AdminLogin        from "./admin/pages/AdminLogin";
import AdminLayout       from "./admin/components/AdminLayout";
import AdminDashboard    from "./admin/pages/AdminDashboard";
import AdminOrders       from "./admin/pages/AdminOrders";
import AdminReservations from "./admin/pages/AdminReservations";
import AdminTables       from "./admin/pages/AdminTables";
import AdminMenu         from "./admin/pages/AdminMenu";
import AdminUsers        from "./admin/pages/AdminUsers";
import AdminAddons       from "./admin/pages/AdminAddons";
import AdminReports      from "./admin/pages/AdminReports";
import AdminStaff        from "./admin/pages/AdminStaff";

const HOME_PATHS = new Set(["/", "/menu", "/about"]);
const LOGO_CLICK_GAP_MS = 700;
const LOGO_CLICK_SEQUENCE_MS = 2200;

function useHiddenAdminEntry() {
  const navigate = useNavigate();
  const sequenceRef = useRef({ count: 0, startedAt: 0, lastAt: 0, timerId: null });

  const resetSequence = useCallback(() => {
    const sequence = sequenceRef.current;
    window.clearTimeout(sequence.timerId);
    sequence.count = 0;
    sequence.startedAt = 0;
    sequence.lastAt = 0;
    sequence.timerId = null;
  }, []);

  useEffect(() => () => resetSequence(), [resetSequence]);

  return useCallback((event) => {
    const sequence = sequenceRef.current;
    if (event.detail === 0 || event.button !== 0) {
      resetSequence();
      return;
    }

    const now = Date.now();
    if (
      sequence.count > 0
      && (now - sequence.lastAt > LOGO_CLICK_GAP_MS
        || now - sequence.startedAt > LOGO_CLICK_SEQUENCE_MS)
    ) {
      resetSequence();
    }

    if (sequence.count === 0) sequence.startedAt = now;
    sequence.count += 1;
    sequence.lastAt = now;
    window.clearTimeout(sequence.timerId);
    sequence.timerId = window.setTimeout(resetSequence, LOGO_CLICK_SEQUENCE_MS);

    if (sequence.count === 5) {
      event.preventDefault();
      resetSequence();
      navigate("/admin/login");
    }
  }, [navigate, resetSequence]);
}

function ScrollToHash() {
  const location = useLocation();

  useEffect(() => {
    const isHomePage = HOME_PATHS.has(location.pathname);

    if (!isHomePage) return;

    if (!location.hash) {
      return;
    }

    const scrollToTarget = () => {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToTarget);
    });
  }, [location]);

  return null;
}

/* ── GuestRoute — redirects authenticated users away from auth pages ───── */
function GuestRoute({ children }) {
  const { user, loading } = useAuth();

  // Still checking token validity on mount — render nothing to avoid flash
  if (loading) return null;

  // Already authenticated → send to Home
  if (user) return <Navigate to="/" replace />;

  return children;
}

/* ── Home page ─────────────────────────────────────────────────────────── */
/* eslint-disable-next-line react/prop-types */
function Home({ onLogoClick }) {
  return (
    <>
      <main>
        <Hero onLogoClick={onLogoClick} />
        <MenuPreview />
        <Features />
        <PromoBlock />
        <Testimonials />
        <About />
      </main>
      <Footer />
    </>
  );
}

/* ── CartAuthSync — clears cart when user logs out ─────────────────────── */
// Sits inside both AuthProvider and CartProvider.
// Watches user: when auth finishes loading and user is falsy (logged out),
// the cart is cleared so no stale items linger for the next user.
function CartAuthSync() {
  const { user, loading } = useAuth();
  const { clearCart } = useCart();
  useEffect(() => {
    if (!loading && !user) clearCart();
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* ── AppShell ───────────────────────────────────────────────────────────── */
function AppShell() {
  const location = useLocation();
  const handleLogoClick = useHiddenAdminEntry();
  const invertedNavbar = ["/orders", "/login", "/my-reservations"].includes(location.pathname);

  return (
    <>
      <Navbar variant={invertedNavbar ? "light" : "dark"} onLogoClick={handleLogoClick} />
      <Routes>
        <Route path="/"            element={<Home onLogoClick={handleLogoClick} />} />
        <Route path="/login"       element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup"      element={<GuestRoute><SignUp /></GuestRoute>} />
        <Route path="/cart"        element={<Cart />} />
        <Route path="/checkout"    element={<Checkout />} />
        <Route path="/orders"           element={<Orders />} />
        <Route path="/my-reservations"  element={<MyReservations />} />
        <Route path="/reservation"      element={<Reservation />} />
        <Route path="/contact"     element={<Placeholder title="Contact" />} />
        <Route path="/profile"     element={<Profile />} />
        <Route path="/menu"        element={<Home onLogoClick={handleLogoClick} />} />
        <Route path="/about"       element={<Home onLogoClick={handleLogoClick} />} />

        {/* ── QR ordering entry points ─────────────────────────────── */}
        {/* /table/:qrSecret  — dine-in: scans QR, creates session     */}
        {/* /table/menu       — dine-in: menu browsing after scan       */}
        {/* /counter          — takeaway: café counter QR entry         */}
        <Route path="/table/:qrSecret" element={<TableScan />} />
        <Route path="/table/menu"      element={<Home onLogoClick={handleLogoClick} />} />
        <Route path="/counter"         element={<CounterMenu />} />
      </Routes>
    </>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <QRSessionProvider>
              <Routes>
                {/* ── Admin subtree — isolated from customer shell ─────── */}
                <Route
                  path="/admin/*"
                  element={
                    <AdminAuthProvider>
                      <AdminRoutes />
                    </AdminAuthProvider>
                  }
                />

                {/* ── Customer shell ───────────────────────────────────── */}
                <Route
                  path="/*"
                  element={
                    <>
                      <CartAuthSync />
                      <ScrollToHash />
                      <div className="mobile-bottom-safe-area">
                        <AppShell />
                        <MobileBottomNav />
                      </div>
                      <ToastStack />
                    </>
                  }
                />
              </Routes>
            </QRSessionProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

/* ── Admin routes (rendered inside AdminAuthProvider) ──────────────────── */
function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<AdminLogin />} />
      <Route element={<AdminLayout />}>
        <Route index                  element={<AdminDashboard />} />
        <Route path="orders"          element={<AdminOrders />} />
        <Route path="reservations"    element={<AdminReservations />} />
        <Route path="tables"          element={<AdminTables />} />
        <Route path="menu"            element={<AdminMenu />} />
        <Route path="users"           element={<AdminUsers />} />
        <Route path="addons"          element={<AdminAddons />} />
        <Route path="reports"         element={<AdminReports />} />
        <Route path="staff"           element={<AdminStaff />} />
        {/* Catch-all inside admin → back to dashboard */}
        <Route path="*"               element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
