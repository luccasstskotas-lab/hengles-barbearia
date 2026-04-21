import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { usePresence } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { 
  Menu, X, Calendar, Scissors, LogOut, Home, 
  User, CalendarDays, Star, MessageCircle, ShoppingBag,
  Users // Importei o ícone de usuários
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) return <FullScreenLoader />;

  if (profile?.is_banned) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl text-destructive">Acesso suspenso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta foi suspensa. Entre em contato com a Hengles Barbearia.
          </p>
        </div>
      </main>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const adminLinks = [
    { to: "/app", icon: Home, label: "Início" },
    { to: "/app/agenda", icon: CalendarDays, label: "Agenda" },
    { to: "/app/usuarios", icon: Users, label: "Usuários" }, // ADICIONADO AQUI
    { to: "/app/loja", icon: ShoppingBag, label: "Gerenciar Loja" },
    { to: "/app/conversas", icon: MessageCircle, label: "Conversas" },
    { to: "/app/servicos", icon: Scissors, label: "Serviços" },
    { to: "/app/avaliacoes", icon: Star, label: "Avaliações" },
  ];

  const clientLinks = [
    { to: "/app", icon: Home, label: "Início" },
    { to: "/app/agendar", icon: Calendar, label: "Agendar" },
    { to: "/app/loja", icon: ShoppingBag, label: "Loja Hengles" },
    { to: "/app/chat", icon: MessageCircle, label: "Chat Suporte" },
    { to: "/app/avaliacoes", icon: Star, label: "Avaliações" },
    { to: "/app/perfil", icon: User, label: "Meu Perfil" },
  ];

  const links = isAdmin ? adminLinks : clientLinks;

  return (
    <NotificationsProvider>
      <PresenceTracker />
      
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md">
        <span className="font-display text-xl font-bold tracking-tight text-primary">Hengles</span>
        <button onClick={() => setMenuOpen(true)} className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-all" onClick={() => setMenuOpen(false)} />
      )}

      <div className={cn(
        "fixed right-0 top-0 z-50 h-[100dvh] w-[280px] border-l border-border bg-card p-6 shadow-2xl transition-transform duration-300 flex flex-col",
        menuOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex items-center justify-between mb-8">
          <span className="font-display text-xl font-bold">Menu</span>
          <button onClick={() => setMenuOpen(false)} className="p-2 text-muted-foreground"><X className="h-6 w-6" /></button>
        </div>

        <nav className="flex flex-col gap-1.5 overflow-y-auto scrollbar-hide">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-primary/10 [&.active]:bg-primary/10 [&.active]:text-primary"
            >
              <link.icon className="h-5 w-5" />
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-border pt-4">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10">
            <LogOut className="h-5 w-5" /> Sair
          </button>
        </div>
      </div>

      <div className="min-h-[calc(100dvh-4rem)]"><Outlet /></div>
    </NotificationsProvider>
  );
}

function PresenceTracker() { usePresence(); return null; }