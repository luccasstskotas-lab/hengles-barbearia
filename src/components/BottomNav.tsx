import { Link, useLocation } from "@tanstack/react-router";
import { Calendar, Home, MessageCircle, ShoppingBag, Star, User, LayoutDashboard, ListChecks } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
}

const clientNav: NavItem[] = [
  { to: "/app", label: "Início", icon: Home, exact: true },
  { to: "/app/agendar", label: "Agendar", icon: Calendar },
  { to: "/app/loja", label: "Loja", icon: ShoppingBag },
  { to: "/app/chat", label: "Chat", icon: MessageCircle },
  { to: "/app/avaliacoes", label: "Avaliar", icon: Star },
  { to: "/app/perfil", label: "Perfil", icon: User },
];

const adminNav: NavItem[] = [
  { to: "/app", label: "Painel", icon: LayoutDashboard, exact: true },
  { to: "/app/agenda", label: "Agenda", icon: ListChecks },
  { to: "/app/conversas", label: "Chat", icon: MessageCircle },
  { to: "/app/loja", label: "Loja", icon: ShoppingBag },
  { to: "/app/avaliacoes", label: "Reviews", icon: Star },
  { to: "/app/perfil", label: "Perfil", icon: User },
];

export function BottomNav() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const items = isAdmin ? adminNav : clientNav;
  const cols = items.length === 6 ? "grid-cols-6" : items.length === 5 ? "grid-cols-5" : "grid-cols-4";

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-card/95 backdrop-blur-xl">
      <ul className={cn("grid px-1 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]", cols)}>
        {items.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[9px] font-medium transition-all",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                    isActive && "bg-primary/15 shadow-gold"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={isActive ? 2.4 : 1.8} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
