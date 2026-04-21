import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { formatPrice, formatDuration, formatTime } from "@/lib/format";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Scissors, ArrowRight, Star, ShoppingBag, Instagram, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminDashboard } from "@/components/AdminDashboard";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: AppHome,
});

function AppHome() {
  const { isAdmin, profile, loading } = useAuth();
  
  if (loading) return <FullScreenLoader />;
  
  return isAdmin ? (
    <AdminDashboard />
  ) : (
    <ClientHome name={profile?.full_name ?? ""} />
  );
}

interface UpcomingBooking {
  id: string;
  slot_date: string;
  start_time: string;
  status: string;
  services: { 
    name: string; 
    image_url: string | null; 
    duration_minutes: number; 
    price_cents: number 
  } | null;
}

function ClientHome({ name }: { name: string }) {
  const { user } = useAuth(); // Pegamos o user para filtrar os agendamentos
  const [upcoming, setUpcoming] = useState<UpcomingBooking[]>([]);
  const [services, setServices] = useState<
    { id: string; name: string; price_cents: number; duration_minutes: number; image_url: string | null }[]
  >([]);

  useEffect(() => {
    if (!user?.id) return;

    const today = new Date().toISOString().slice(0, 10);
    
    const fetchUpcoming = () =>
      supabase
        .from("bookings")
        .select("id, slot_date, start_time, status, services(name, image_url, duration_minutes, price_cents)")
        .eq("client_id", user.id) // FILTRO ESSENCIAL: Garante que o cliente veja apenas os DELE
        .gte("slot_date", today)
        .in("status", ["pending", "confirmed"])
        .order("slot_date")
        .order("start_time")
        .limit(3)
        .then(({ data }) => setUpcoming((data as unknown as UpcomingBooking[]) ?? []));

    fetchUpcoming();

    // Busca serviços em destaque
    supabase
      .from("services")
      .select("id, name, price_cents, duration_minutes, image_url")
      .eq("is_active", true)
      .limit(4)
      .then(({ data }) => setServices(data ?? []));

    // Realtime filtrado para o usuário logado
    const ch = supabase
      .channel(`home-live-${user.id}`)
      .on(
        "postgres_changes", 
        { 
          event: "*", 
          schema: "public", 
          table: "bookings",
          filter: `client_id=eq.${user.id}` 
        }, 
        fetchUpcoming
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const firstName = name.split(" ")[0] || "Cliente";

  return (
    <div className="px-5 pt-6 pb-24 transition-colors duration-300 bg-background">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-2">
        <BrandLogo />
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Olá, <span className="font-bold text-foreground">{firstName}</span>
          </p>
          <NotificationBell />
        </div>
      </header>

      {/* BANNER PRINCIPAL */}
      <section className="mt-7 animate-in fade-in slide-in-from-bottom-2">
        <div className="rounded-3xl bg-gradient-gold p-6 text-[#1a1612] shadow-gold relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Pronto para o próximo corte?</p>
            <h2 className="font-display text-3xl font-bold leading-tight">
              Agende em<br/>segundos.
            </h2>
            <Link to="/app/agendar">
              <Button className="mt-5 h-11 px-6 rounded-xl bg-[#1a1612] text-white hover:bg-[#1a1612]/90 font-bold shadow-lg transition-transform active:scale-95">
                Agendar agora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <Scissors className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 -rotate-12" />
        </div>
      </section>

      {/* PRÓXIMOS AGENDAMENTOS */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-foreground">Próximos agendamentos</h3>
          <Link to="/app/perfil" className="text-xs font-bold text-primary uppercase tracking-wider">Ver todos</Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center bg-card/50 shadow-sm">
            <Calendar className="mx-auto h-8 w-8 text-muted-foreground opacity-30" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">Nenhum agendamento por aqui.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-4 rounded-3xl border border-border bg-card p-3.5 shadow-elegant transition-all"
              >
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-muted border border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                    {format(parseISO(b.slot_date), "MMM", { locale: ptBR })}
                  </span>
                  <span className="text-lg font-black text-foreground leading-none">
                    {format(parseISO(b.slot_date), "d")}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{b.services?.name ?? "Serviço"}</p>
                  <p className="text-[12px] font-medium text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    {format(parseISO(b.slot_date), "EEEE", { locale: ptBR })} • {formatTime(b.start_time)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="block text-sm font-black text-primary">
                    {formatPrice(b.services?.price_cents ?? 0)}
                  </span>
                  <span className={cn(
                    "text-[9px] font-bold uppercase tracking-widest mt-0.5",
                    b.status === "confirmed" ? "text-success" : "text-amber-500"
                  )}>
                    {b.status === "confirmed" ? "Confirmado" : "Pendente"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* SERVIÇOS EM DESTAQUE */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-foreground">Serviços em destaque</h3>
          <Link to="/app/agendar" className="text-xs font-bold text-primary uppercase tracking-wider">Ver todos</Link>
        </div>
        
        {services.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm font-medium text-muted-foreground bg-card/50">
            Em breve novos serviços.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {services.map((s) => (
              <Link
                key={s.id}
                to="/app/agendar"
                className="overflow-hidden rounded-3xl border border-border bg-card shadow-elegant transition-transform hover:scale-[1.02] active:scale-[0.98] flex flex-col group"
              >
                <div className="relative aspect-[4/3] w-full bg-black flex items-center justify-center overflow-hidden">
                  {s.image_url ? (
                    <img src={s.image_url} alt={s.name} className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" />
                  ) : (
                    <Scissors className="h-8 w-8 text-white/20" />
                  )}
                </div>
                <div className="p-3.5 flex flex-col flex-1">
                  <p className="truncate text-[13px] font-bold text-foreground leading-tight">{s.name}</p>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{formatDuration(s.duration_minutes)}</p>
                  <p className="mt-auto pt-2 text-sm font-black text-primary">{formatPrice(s.price_cents)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ATALHOS RÁPIDOS */}
      <section className="mt-8 flex flex-col gap-3">
        <Link
          to="/app/loja"
          className="flex items-center justify-between rounded-3xl border border-border bg-card p-4 shadow-elegant transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShoppingBag className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Loja Hengles</p>
              <p className="text-xs font-medium text-muted-foreground">Produtos exclusivos para você</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        <Link
          to="/app/avaliacoes"
          className="flex items-center justify-between rounded-3xl border border-border bg-card p-4 shadow-elegant transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Star className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Avaliações</p>
              <p className="text-xs font-medium text-muted-foreground">Veja o que dizem da Hengles</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        <a
          href="https://instagram.com/henglesbarbearia"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-3xl border border-border bg-card p-4 shadow-elegant transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-500/10 text-pink-500">
              <Instagram className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Instagram</p>
              <p className="text-xs font-medium text-muted-foreground">Acompanhe nossos cortes</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </a>

        <a
          href="https://www.google.com/maps/place/R.+Novo+Hamburgo,+331+-+Jardim+Vista+Alegre,+Embu+das+Artes+-+SP,+06807-060/@-23.6336057,-46.823659,17z/data=!4m6!3m5!1s0x94cfab34b62e3515:0xbd75d68104d7d6f!8m2!3d-23.6296642!4d-46.8257189!16s%2Fg%2F11csmg9z5j?entry=ttu&g_ep=EgoyMDI2MDQxNS4wIKXMDSoASAFQAw%3D%3D"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-3xl border border-border bg-card p-4 shadow-elegant transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
              <MapPin className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Como Chegar</p>
              <p className="text-xs font-medium text-muted-foreground">Rota para a barbearia</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </a>
      </section>
    </div>
  );
}