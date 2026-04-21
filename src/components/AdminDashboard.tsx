import { AdminAiAssistant } from "@/components/AdminAiAssistant";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { formatPrice } from "@/lib/format";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar, DollarSign, Users, ListChecks, Edit2,
  Loader2, Clock, Activity, CheckCircle2, XCircle, ChevronRight,
  Sparkles, UserMinus, Coffee, Power, Phone
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Booking {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
  price_cents: number;
  client_id: string | null;
  service_id: string | null;
  notes: string | null;
  client_name: string;
  client_phone: string; // Adicionado telefone
  service_name: string;
}

interface StoreStatus {
  is_paused: boolean;
  return_time: string;
  message: string;
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending:   { label: "Pendente",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",     dot: "bg-amber-400" },
  confirmed: { label: "Confirmado", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  completed: { label: "Concluído",  cls: "bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20",     dot: "bg-[#D4AF37]" },
  cancelled: { label: "Cancelado",  cls: "bg-red-500/10 text-red-400 border-red-500/20",            dot: "bg-red-400" },
  no_show:   { label: "Faltou",     cls: "bg-red-500/10 text-red-500 border-red-500/20",            dot: "bg-red-500" },
};

export function AdminDashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [storeStatus, setStoreStatus] = useState<StoreStatus>({
    is_paused: false,
    return_time: "",
    message: "",
  });
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseForm, setPauseForm] = useState<StoreStatus>({
    is_paused: false,
    return_time: "",
    message: "",
  });

  const loadData = useCallback(async () => {
    try {
      const { data: bData, error: bError } = await supabase
        .from("bookings")
        .select("*")
        .order("slot_date", { ascending: false })
        .order("start_time", { ascending: false });
      if (bError) throw bError;

      // Buscando telefone agora também
      const { data: pData } = await supabase.from("profiles").select("id, full_name, phone");
      const { data: sData } = await supabase.from("services").select("id, name");

      const combined: Booking[] = (bData || []).map((b: any) => {
        const clientProfile = pData?.find((p: any) => p.id === b.client_id);
        return {
          ...b,
          client_name: clientProfile?.full_name || "Cliente",
          client_phone: clientProfile?.phone || "S/ Tel",
          service_name: sData?.find((s: any) => s.id === b.service_id)?.name || b.notes || "Serviço",
        };
      });
      setBookings(combined);

      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      setClientCount(count ?? 0);

      const { data: statusData } = await supabase
        .from("store_status")
        .select("is_paused, return_time, message")
        .eq("id", 1)
        .maybeSingle();
      if (statusData) {
        setStoreStatus({
          is_paused: !!statusData.is_paused,
          return_time: statusData.return_time ?? "",
          message: statusData.message ?? "",
        });
      }
    } catch (err: any) {
      console.error("Erro no loadData:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("admin-realtime-v3")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        () => {
          toast.success("🔔 NOVO AGENDAMENTO!", {
            description: "Um cliente acabou de marcar um horário agora.",
            duration: 8000,
            position: "top-center",
          });
          loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_status" },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const updateBooking = async () => {
    if (!editingBooking || !editStatus) return;
    setIsUpdating(true);
    const { error } = await supabase
      .from("bookings")
      .update({
        slot_date: editDate,
        start_time: editTime.length === 5 ? `${editTime}:00` : editTime,
        status: editStatus,
      })
      .eq("id", editingBooking.id);

    setIsUpdating(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Agenda atualizada com sucesso!");
      setEditingBooking(null);
      loadData();
    }
  };

  const saveStoreStatus = async () => {
    setIsUpdating(true);
    const { error } = await supabase
      .from("store_status")
      .update({
        is_paused: pauseForm.is_paused,
        return_time: pauseForm.return_time,
        message: pauseForm.message,
      })
      .eq("id", 1);
    setIsUpdating(false);

    if (error) {
      console.error(error);
      toast.error("Erro ao mudar o status da loja.");
      return;
    }

    toast.success(
      pauseForm.is_paused
        ? "App pausado! Bom almoço! 🍔"
        : "App reaberto! Bora trabalhar! ✂️"
    );
    setStoreStatus(pauseForm);
    setPauseModalOpen(false);
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayAtivos = bookings.filter(
    (b) => b.slot_date === todayStr && b.status !== "cancelled" && b.status !== "no_show"
  );
  const revenue = bookings
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((acc, b) => acc + (b.price_cents || 0), 0);
  const totalAgendamentos = bookings.length;
  const totalFaltas = bookings.filter((b) => b.status === "no_show").length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* HEADER */}
      <header className="px-6 pt-6 pb-4 bg-gradient-to-b from-[#0a0a0a] to-transparent">
        <div className="flex items-center justify-between mb-6">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setPauseForm(storeStatus);
                setPauseModalOpen(true);
              }}
              variant="outline"
              className={cn(
                "h-10 rounded-xl font-bold border transition-all gap-2 px-3",
                storeStatus.is_paused
                  ? "bg-red-500/10 text-red-500 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse"
                  : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              <Coffee className="h-4 w-4" />
              {storeStatus.is_paused ? "App Pausado" : "Pausar App"}
            </Button>
            <NotificationBell />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[#D4AF37] text-xs uppercase tracking-widest font-bold">
            <Sparkles className="h-3 w-3" />
            Painel Admin
          </div>
          <h1 className="text-3xl font-bold">Bom dia ✨</h1>
          <p className="text-white/50 text-sm capitalize">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
      </header>

      <div className="px-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard icon={Calendar}    label="Hoje"          value={String(todayAtivos.length)}  hint="agendamentos ativos" highlight iconColor="text-[#D4AF37]" />
          <KpiCard icon={DollarSign}  label="Receita"       value={formatPrice(revenue)}        hint="confirmados/concluídos" iconColor="text-emerald-400" />
          <KpiCard icon={Users}       label="Clientes"      value={String(clientCount)}         hint="cadastrados" iconColor="text-blue-400" />
          <KpiCard icon={ListChecks}  label="Total"         value={String(totalAgendamentos)}   hint="histórico geral" iconColor="text-purple-400" />
          <KpiCard icon={UserMinus}   label="Faltas"        value={String(totalFaltas)}         hint="no-shows registrados" className="col-span-2" iconColor="text-red-400" />
        </div>

        {/* MURAL */}
        <section className="rounded-3xl bg-[#0d0d0d] border border-white/5 p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
                <Activity className="h-5 w-5 text-[#D4AF37]" />
              </div>
              <div>
                <h2 className="font-bold text-base">Mural de Atividades</h2>
                <p className="text-xs text-white/40">
                  Últimos {Math.min(15, bookings.length)} agendamentos
                </p>
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              Live
            </span>
          </div>

          {bookings.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUpEmpty />
              <p className="text-white/40 mt-3">Nenhum agendamento ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bookings.slice(0, 15).map((b) => {
                const meta = STATUS_META[b.status] ?? STATUS_META.pending;
                const isToday = b.slot_date === todayStr;
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "flex items-center gap-4 p-3 rounded-2xl border transition-all",
                      isToday
                        ? "bg-[#D4AF37]/5 border-[#D4AF37]/20"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/5"
                    )}
                  >
                    <div className="flex flex-col items-center justify-center min-w-[60px]">
                      <span className="text-base font-bold text-white">
                        {b.start_time.slice(0, 5)}
                      </span>
                      <span className="text-[10px] text-white/40 uppercase">
                        {format(parseISO(b.slot_date), "d MMM", { locale: ptBR })}
                      </span>
                    </div>

                    <div className="w-px h-10 bg-white/10" />

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate text-sm">{b.client_name}</p>
                      {/* INFORMAÇÃO EXTRA: TELEFONE */}
                      <div className="flex items-center gap-1 text-[10px] text-white/40 font-medium truncate">
                        <Phone className="h-2.5 w-2.5" />
                        {b.client_phone}
                      </div>
                      <p className="text-xs text-white/60 truncate mt-0.5">{b.service_name}</p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">
                          {formatPrice(b.price_cents)}
                        </span>
                        <span className={cn("text-[10px] px-2 py-1 rounded-full border font-bold flex items-center gap-1", meta.cls)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                          {meta.label}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setEditingBooking(b);
                          setEditDate(b.slot_date);
                          setEditTime(b.start_time.slice(0, 5));
                          setEditStatus(b.status);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-[#D4AF37] border border-white/5 hover:bg-[#D4AF37] hover:text-black hover:scale-105 active:scale-95 transition-all"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* MODAL EDITAR RESERVA */}
      <Dialog open={!!editingBooking} onOpenChange={(o) => !o && setEditingBooking(null)}>
        <DialogContent className="bg-[#0d0d0d] border-white/10 text-white rounded-3xl max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
                <Edit2 className="h-5 w-5 text-[#D4AF37]" />
              </div>
              <div>
                <DialogTitle className="text-lg">Gerenciar Reserva</DialogTitle>
                <DialogDescription className="text-white/50 text-xs">
                  Cliente: {editingBooking?.client_name} ({editingBooking?.client_phone})
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-white/60 mb-1 block">Data</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="h-12 rounded-2xl bg-white/5 border-white/10 text-white focus-visible:ring-[#D4AF37]"
                />
              </div>
              <div>
                <Label className="text-xs text-white/60 mb-1 block">Hora</Label>
                <Input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="h-12 rounded-2xl bg-white/5 border-white/10 text-white focus-visible:ring-[#D4AF37]"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-white/60 mb-2 block">Definir Status</Label>
              <div className="space-y-2">
                {[
                  { id: "pending",   label: "Pendente",   icon: Clock,        color: "text-amber-400" },
                  { id: "confirmed", label: "Confirmado", icon: CheckCircle2, color: "text-emerald-400" },
                  { id: "completed", label: "Concluído",  icon: DollarSign,   color: "text-[#D4AF37]" },
                  { id: "no_show",   label: "Faltou",     icon: UserMinus,    color: "text-red-500" },
                  { id: "cancelled", label: "Cancelado",  icon: XCircle,      color: "text-red-400" },
                ].map((st) => {
                  const Icon = st.icon;
                  const active = editStatus === st.id;
                  return (
                    <button
                      key={st.id}
                      onClick={() => setEditStatus(st.id)}
                      className={cn(
                        "flex items-center justify-between w-full h-14 px-5 rounded-2xl border transition-all",
                        active
                          ? "bg-white/10 border-[#D4AF37] shadow-[0_0_0_1px_rgba(212,175,55,0.3)]"
                          : "bg-white/5 border-transparent text-white/50 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className="flex items-center gap-3 font-bold">
                        <Icon className={cn("h-5 w-5", st.color)} />
                        {st.label}
                      </span>
                      {active && <ChevronRight className="h-4 w-4 text-[#D4AF37]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={() => setEditingBooking(null)}
              variant="outline"
              className="flex-1 h-14 rounded-2xl border-white/10 bg-transparent text-white/60 hover:bg-white/5 hover:text-white font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={updateBooking}
              disabled={isUpdating}
              className="flex-1 h-14 rounded-2xl bg-[#D4AF37] hover:bg-[#c5a02f] text-black font-bold"
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PAUSA */}
      <Dialog open={pauseModalOpen} onOpenChange={setPauseModalOpen}>
        <DialogContent className="bg-[#0d0d0d] border-white/10 text-white rounded-3xl max-w-md">
          <DialogHeader>
            <div className="mx-auto h-14 w-14 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mb-2">
              {pauseForm.is_paused ? (
                <Coffee className="h-6 w-6 text-red-400" />
              ) : (
                <Power className="h-6 w-6 text-[#D4AF37]" />
              )}
            </div>
            <DialogTitle className="text-center text-lg">Status do App</DialogTitle>
            <DialogDescription className="text-center text-white/50 text-xs">
              Pause o aplicativo temporariamente para que os clientes não consigam agendar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <button
              onClick={() => setPauseForm({ ...pauseForm, is_paused: !pauseForm.is_paused })}
              className={cn(
                "flex items-center justify-between w-full p-4 rounded-2xl border transition-all",
                pauseForm.is_paused
                  ? "bg-red-500/5 border-red-500/30"
                  : "bg-[#D4AF37]/5 border-[#D4AF37]/30"
              )}
            >
              <span className="font-bold flex items-center gap-3">
                <span className={cn("h-2 w-2 rounded-full", pauseForm.is_paused ? "bg-red-500 animate-pulse" : "bg-[#D4AF37]")} />
                {pauseForm.is_paused ? "Aplicativo Pausado" : "Aplicativo Aberto"}
              </span>
              <span
                className={cn(
                  "relative inline-flex h-7 w-12 rounded-full transition-colors",
                  pauseForm.is_paused ? "bg-red-500" : "bg-[#D4AF37]"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform",
                    pauseForm.is_paused ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </span>
            </button>

            {pauseForm.is_paused && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-white/60 mb-1 block">
                    Previsão de Retorno (Opcional)
                  </Label>
                  <Input
                    type="time"
                    value={pauseForm.return_time}
                    onChange={(e) => setPauseForm({ ...pauseForm, return_time: e.target.value })}
                    className="h-12 rounded-2xl bg-[#161616] border-white/5 focus-visible:ring-[#D4AF37] text-white"
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/60 mb-1 block">
                    Mensagem para o cliente
                  </Label>
                  <Input
                    value={pauseForm.message}
                    onChange={(e) => setPauseForm({ ...pauseForm, message: e.target.value })}
                    placeholder="Ex: Fomos almoçar, voltamos já!"
                    className="h-12 rounded-2xl bg-[#161616] border-white/5 focus-visible:ring-[#D4AF37] text-white placeholder:text-white/20"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={saveStoreStatus}
              disabled={isUpdating}
              className="w-full h-14 rounded-2xl bg-[#D4AF37] hover:bg-[#c5a02f] text-black font-bold"
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAiAssistant />
    </div>
  );
}

function TrendingUpEmpty() {
  return (
    <div className="mx-auto h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
      <Calendar className="h-5 w-5 text-white/30" />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  highlight,
  className,
  iconColor,
}: {
  icon: any;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
  className?: string;
  iconColor?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-3xl bg-[#0d0d0d] border border-white/5 p-4 overflow-hidden",
        highlight && "border-[#D4AF37]/30",
        className
      )}
    >
      {highlight && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 to-transparent pointer-events-none" />
      )}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Icon className={cn("h-4 w-4", iconColor || "text-white/70")} />
          </div>
          <span className="text-xs text-white/50 font-medium">{label}</span>
        </div>
        <div className="text-2xl font-bold mb-1">{value}</div>
        <p className="text-[11px] text-white/40">{hint}</p>
      </div>
    </div>
  );
}