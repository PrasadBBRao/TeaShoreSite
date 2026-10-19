/**
 * AdminSidebar.jsx — Admin panel navigation sidebar.
 * Sidebar bg: #26372E (deep muted forest green) with white text.
 */

import { NavLink } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAdminAuth } from "../context/AdminAuthContext";
import faviconLogo from "../../assets/favicon.png";

const NAV_ITEMS = [
  {
    section: "Overview",
    items: [
      { to: "/admin",             label: "Dashboard",           icon: IconDashboard, end: true },
    ],
  },
  {
    section: "Operations",
    items: [
      { to: "/admin/orders",        label: "Orders",            icon: IconOrders    },
      { to: "/admin/reservations",  label: "Reservations",      icon: IconCalendar  },
      { to: "/admin/tables",        label: "Tables & Sessions", icon: IconTables    },
    ],
  },
  {
    section: "Catalogue",
    items: [
      { to: "/admin/menu",   label: "Menu",     icon: IconMenu   },
      { to: "/admin/addons", label: "Add-ons",  icon: IconAddons },
    ],
  },
  {
    section: "People",
    items: [
      { to: "/admin/users",  label: "Users",    icon: IconUsers  },
    ],
  },
  {
    section: "Insights",
    items: [
      { to: "/admin/reports", label: "Reports", icon: IconReports },
    ],
  },
];

function IconDashboard()  { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>; }
function IconOrders()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><path d="M4 4h12a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M7 8h6M7 12h4"/></svg>; }
function IconCalendar()   { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><rect x="2" y="4" width="16" height="14" rx="2"/><path d="M2 8h16M6 2v4M14 2v4"/></svg>; }
function IconTables()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><ellipse cx="10" cy="7" rx="8" ry="3"/><path d="M2 7v6c0 1.66 3.58 3 8 3s8-1.34 8-3V7"/><path d="M2 10c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>; }
function IconMenu()       { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><path d="M6 4h8M4 8h12M6 12h8M4 16h12"/></svg>; }
function IconAddons()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/></svg>; }
function IconUsers()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><circle cx="8" cy="6" r="3"/><path d="M2 18c0-3.31 2.69-6 6-6s6 2.69 6 6"/><circle cx="15" cy="8" r="2"/><path d="M18 18c0-2.21-1.34-4-3-4"/></svg>; }
function IconReports()    { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><path d="M4 16V9M8 16V4M12 16v-6M16 16v-3"/></svg>; }
function IconStaff()      { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><circle cx="7" cy="6" r="3"/><path d="M1 18c0-3.31 2.69-6 6-6"/><circle cx="14" cy="10" r="2.5"/><path d="M11 18c0-2.21 1.34-4 3-4s3 1.79 3 4"/><path d="M17 10h-1.5M14 7v1.5"/></svg>; }
function IconLogout()     { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0"><path d="M13 15l3-5-3-5M16 10H7"/><path d="M9 18H5a2 2 0 01-2-2V4a2 2 0 012-2h4"/></svg>; }

function SidebarLink({ to, label, Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-white/15 text-white font-semibold"
            : "text-white/65 hover:bg-white/10 hover:text-white",
        ].join(" ")
      }
    >
      <Icon />
      {label}
    </NavLink>
  );
}

function SidebarContent({ onLinkClick }) {
  const { admin, logout } = useAdminAuth();

  return (
    <div className="flex h-full flex-col">
      {/* Branding */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                        bg-white/15 border border-white/10 overflow-hidden shadow-sm">
          <img src={faviconLogo} alt="Teashore" className="h-7 w-7 object-contain" draggable={false} />
        </div>
        <div className="min-w-0">
          <p className="font-poppins text-[15px] font-bold text-white leading-none tracking-wide">
            Teashore
          </p>
          <p className="mt-1 font-sans text-[9px] font-semibold uppercase tracking-[0.2em] text-white/45">
            Admin Panel
          </p>
        </div>
        {admin?.role === "head_admin" && (
          <ShieldCheck
            size={14}
            strokeWidth={1.8}
            className="ml-auto shrink-0 text-white/40"
            aria-label="Head Admin"
          />
        )}
      </div>

      {/* Nav */}
      <nav className="admin-scroll flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_ITEMS.map(({ section, items }) => (
          <div key={section}>
            <p className="mb-1.5 px-3 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              {section}
            </p>
            <div className="space-y-0.5">
              {items.map(({ to, label, icon: Icon, end }) => (
                <SidebarLink key={to} to={to} label={label} Icon={Icon} end={end} onClick={onLinkClick} />
              ))}
            </div>
          </div>
        ))}

        {admin?.role === "head_admin" && (
          <div>
            <p className="mb-1.5 px-3 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Management
            </p>
            <div className="space-y-0.5">
              <SidebarLink to="/admin/staff" label="Staff Accounts" Icon={IconStaff} onClick={onLinkClick} />
            </div>
          </div>
        )}
      </nav>

      {/* Admin info + logout */}
      <div className="border-t border-white/10 px-3 py-4">
        {admin && (
          <div className="mb-3 flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                            bg-white/15 text-white font-poppins font-bold text-xs">
              {admin.username?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="min-w-0">
              <p className="font-poppins text-sm font-semibold text-white truncate">{admin.username}</p>
              <p className="font-sans text-[10px] text-white/45 capitalize">
                {admin.role === "head_admin" ? "Head Admin" : "Staff"}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                     text-white/60 hover:bg-red-500/15 hover:text-red-300 transition-all duration-150"
        >
          <IconLogout />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AdminSidebar({ mobileOpen, onClose }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60
                        bg-[#26372E] border-r border-[#1E2E25] z-30">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" aria-modal="true" role="dialog" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-[#26372E] border-r border-[#1E2E25]
                            flex flex-col shadow-2xl">
            <button
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center
                         rounded-full text-white/60 hover:bg-white/10 transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15"/>
              </svg>
            </button>
            <SidebarContent onLinkClick={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
