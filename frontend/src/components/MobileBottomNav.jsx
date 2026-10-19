import { useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  UtensilsCrossed,
  CalendarDays,
  ClipboardList,
  UserRound,
} from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../context/AuthContext";

const ITEMS = [
  { id: "home",        label: "Home",         to: "/",            Icon: Home            },
  { id: "menu",        label: "Menu",         to: "/menu",        Icon: UtensilsCrossed },
  { id: "reservation", label: "Reservations", to: "/reservation", Icon: CalendarDays    },
  { id: "orders",      label: "Orders",       to: "/orders",      Icon: ClipboardList   },
];

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function matchPath(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to);
}

export default function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const profileTo = user ? "/profile" : "/login";
  const activeId = ["/profile", "/login"].includes(location.pathname)
    ? "profile"
    : (ITEMS.find((item) => matchPath(location.pathname, item.to))?.id ?? null);
  const activeIndex = activeId === "profile"
    ? 4
    : ITEMS.findIndex((item) => item.id === activeId);

  const iconColor = (active) => active ? "#FFFFFF" : "rgba(255,245,235,0.65)";

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden"
      style={{
        position: "fixed",
        bottom: "16px",
        left: "22px",
        right: "22px",
        zIndex: 60,
      }}
    >
      <div
        style={{
          height: "58px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderRadius: "29px",
          background: "rgba(20, 15, 12, 0.55)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          overflow: "visible",
          position: "relative",
        }}
      >
        {activeIndex >= 0 && (
          <motion.span
            aria-hidden="true"
            animate={{
              left: `calc(16px + (100% - 32px) * ${(activeIndex + 0.5) / 5})`,
            }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            style={{
              position: "absolute",
              width: "82px",
              height: "48px",
              borderRadius: "24px",
              background: "rgba(255,255,255,0.18)",
              top: "4.2px",
              left: `calc(16px + (100% - 32px) * ${(activeIndex + 0.5) / 5})`,
              transform: "translateX(-50%)",
              pointerEvents: "none",
            }}
          />
        )}

        {ITEMS.map(({ id, label, to, Icon }) => {
          const active = activeId === id;
          return (
            <button
              key={id}
              onClick={() => navigate(to)}
              aria-label={label}
              title={label}
              style={{
                flex: "1 1 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                height: "58px",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Icon
                size={24}
                strokeWidth={2}
                color={iconColor(active)}
                fill={id === "home" && active ? "#FFFFFF" : "none"}
                style={{ position: "relative", zIndex: 1 }}
                aria-hidden="true"
              />
            </button>
          );
        })}

        {/* Profile */}
        <button
          onClick={() => navigate(profileTo)}
          aria-label={user ? "Profile" : "Login"}
          title={user ? "Profile" : "Login"}
          style={{
            flex: "1 1 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            height: "58px",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {user ? (
            <span
              style={{
                position: "relative",
                zIndex: 1,
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,245,235,0.9)",
                color: "#2B1E16",
                fontSize: "11px",
                fontWeight: 700,
                userSelect: "none",
              }}
              aria-hidden="true"
            >
              {getInitials(user.name)}
            </span>
          ) : (
            <UserRound
              size={24}
              strokeWidth={2}
              color={iconColor(activeId === "profile")}
              style={{ position: "relative", zIndex: 1 }}
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    </nav>
  );
}
