/**
 * AdminLayout.jsx — Protected wrapper for all admin pages.
 */

import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayout() {
  const { admin, loading } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F6F0] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#34483D] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F7F6F0]">
      <AdminSidebar
        mobileOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="lg:pl-60 flex flex-col min-h-screen">
        <main className="admin-scroll flex-1 p-4 sm:p-6 pt-14 lg:pt-6">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="fixed top-3 left-3 z-20 flex h-9 w-9 items-center justify-center
                       rounded-lg bg-white border border-[#E4E6DE]
                       text-[#737C72] hover:bg-[#F7F6F0] hover:text-[#26372E]
                       transition-colors lg:hidden"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" className="w-5 h-5" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14"/>
            </svg>
          </button>

          <Outlet />
        </main>
      </div>
    </div>
  );
}
