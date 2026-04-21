import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatTime, formatPrice } from "@/lib/format";
import {
  Plus, Loader2, Trash2, CheckCircle2, XCircle, Clock,
  CalendarPlus, ChevronDown, Search, Camera, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/app/agenda")({
  component: AdminAgendaPage,
});

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  service_id: string | null;
}

interface Booking {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
  price_cents: number;
  notes: string | null;
  client_id: string | null;
  service_id: string | null; // Adicionado para a vaga livre saber qual serviço é
  image_url: string | null;
  services: { name: string; image_url: string | null } | null;
  profiles: { full_name: string; phone: string | null } | null;
}

interface ClientProfile {
  id: string;
  full_name: string | null;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  image_url: string | null;
}

function checkTimeOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && endA > startB;
}

function AdminAgendaPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  
  // Usando format do date-fns para fixar o fuso horário correto
  const today = format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [openModal, setOpenModal] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app" });
  }, [isAdmin, loading, navigate]);

  const load = useCallback(async () => {
    // Busca manual para evitar os crashs de relação do Supabase e garantir que apareça na tela
    const { data: slotsRes } = await supabase
      .from("availability_slots")
      .select("*")
      .gte("slot_date", today)
      .order("slot_date")
      .order("start_time");

    const { data: bookingsRes } = await supabase
      .from("bookings")
      .select("*")
      .gte("slot_date", today)
      .order("slot_date")
      .order("start_time");

    const { data: profsRes } = await supabase.from("profiles").select("id, full_name, phone");
    const { data: servsRes } = await supabase.from("services").select("id, name, image_url");

    if (slotsRes) setSlots(slotsRes as Slot[]);

    if (bookingsRes) {
      const combinedBookings = bookingsRes.map((b: any) => {
        const client = profsRes?.find((p) => p.id === b.client_id);
        const service = servsRes?.find((s) => s.id === b.service_id);
        
        return {
          ...b,
          profiles: client ? { full_name: client.full_name, phone: client.phone } : null,
          services: service ? { name: service.name, image_url: service.image_url } : null,
        };
      });
      
      setBookings(combinedBookings as unknown as Booking[]);
    }
  }, [today]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("agenda-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "availability_slots" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const days = Array.from({ length: 14 }).map((_, i) =>
    format(addDays(new Date(), i), "yyyy-MM-dd")
  );
  
  const daySlots = slots.filter((s) => s.slot_date?.slice(0, 10) === date);
  const dayBookings = bookings.filter(
    (b) => b.slot_date?.slice(0, 10) === date && b.status !== "cancelled"
  );

  // FUNÇÃO: Atualiza status e libera vaga se faltou
  const setStatus = async (id: string, status: "completed" | "no_show" | "cancelled" | "confirmed") => {
    const target = bookings.find(b => b.id === id);
    
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error("Erro ao atualizar: " + error.message);

    if (status === "no_show" && target) {
      await supabase.from("availability_slots").insert({
        slot_date: target.slot_date,
        start_time: target.start_time,
        end_time: target.end_time,
        service_id: target.service_id
      });
      toast.success("Falta registrada e horário liberado no app!");
    } else {
      toast.success("Status atualizado");
    }
    
    load();
  };

  // FUNÇÃO: Apagar do histórico permanentemente
  const deleteBooking = async (id: string) => {
    if (!confirm("Deseja apagar permanentemente este agendamento do histórico?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    toast.success("Registro apagado!");
    load();
  };

  const removeSlot = async (id: string) => {
    if (!confirm("Remover este horário disponível?")) return;
    const { error } = await supabase.from("availability_slots").delete().eq("id", id);
    if (error) return toast.error("Erro ao remover: " + error.message);
    load();
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4 pb-24">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/app" })}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Agenda</h1>
            <p className="text-xs text-muted-foreground">Reservas e disponibilidade</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setOpenModal(true)}
            className="bg-gradient-gold text-primary-foreground shadow-md hover:scale-105 transition-all"
          >
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
          <NotificationBell />
        </div>
      </div>

      {/* SELETOR DE DIA */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-2">
          {days.map((d) => {
            const has =
              slots.some((s) => s.slot_date?.slice(0, 10) === d) ||
              bookings.some((b) => b.slot_date?.slice(0, 10) === d && b.status !== "cancelled");
            const active = date === d;
            const dt = parseISO(d);
            return (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={cn(
                  "flex w-14 shrink-0 flex-col items-center rounded-2xl border px-2 py-2 transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-gold scale-105"
                    : has
                    ? "border-success/40 bg-success/10"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="text-[10px] uppercase">{format(dt, "EEE", { locale: ptBR })}</span>
                <span className="text-lg font-bold">{format(dt, "d")}</span>
                <span className="text-[9px] uppercase">{format(dt, "MMM", { locale: ptBR })}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RESERVAS DO DIA */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold">
            Reservas ({dayBookings.length}) —{" "}
            {format(parseISO(date), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h2>
        </div>

        {dayBookings.length === 0 ? (
          <div className="text-center py-8">
            <CalendarPlus className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum cliente agendado para este dia.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Toque em + Novo para criar um agendamento.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayBookings
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((b) => {
                const displayImg = b.image_url || b.services?.image_url;
                return (
                  <div key={b.id} className="rounded-xl border border-border bg-background p-3 space-y-3">
                    <div className="flex gap-3">
                      {displayImg ? (
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                          <img src={displayImg} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Clock className="h-4 w-4 mb-1" />
                          <span className="text-xs font-bold">{formatTime(b.start_time)}</span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">
                          {b.profiles?.full_name ?? "Cliente VIP"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {displayImg && (
                            <>
                              {formatTime(b.start_time)} •{" "}
                            </>
                          )}
                          {b.services?.name ?? b.notes ?? "Serviço Avulso"}
                        </p>
                        {b.notes && b.services?.name && (
                          <p className="text-xs text-muted-foreground/70 italic mt-1 truncate">
                            "{b.notes}"
                          </p>
                        )}
                        {b.profiles?.phone && (
                          <a
                            href={`tel:${b.profiles.phone}`}
                            className="text-xs text-primary mt-1 inline-block"
                          >
                            📞 {b.profiles.phone}
                          </a>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <p className="text-sm font-bold text-primary">{formatPrice(b.price_cents)}</p>
                        <StatusPill status={b.status} />
                        {/* Botão de Excluir Agendamento */}
                        <button 
                          onClick={() => deleteBooking(b.id)} 
                          className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors mt-1" 
                          title="Apagar agendamento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {b.status !== "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStatus(b.id, "completed")}
                          className="flex-1 h-8 border-success/40 hover:bg-success/10 text-success"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir
                        </Button>
                      )}
                      {b.status !== "no_show" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStatus(b.id, "no_show")}
                          className="flex-1 h-8 border-destructive/40 hover:bg-destructive/10 text-destructive"
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Faltou
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* VAGAS LIVRES */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h2 className="text-sm font-bold">Vagas Livres (App)</h2>
        {daySlots.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma vaga solta criada para hoje.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {daySlots.map((s) => {
              const isBooked = dayBookings.some((b) =>
                checkTimeOverlap(s.start_time, s.end_time, b.start_time, b.end_time)
              );
              return (
                <div
                  key={s.id}
                  className={cn(
                    "relative rounded-lg px-3 py-2 text-xs font-bold",
                    isBooked
                      ? "bg-muted text-muted-foreground line-through"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  {formatTime(s.start_time)}
                  {!isBooked && (
                    <button
                      onClick={() => removeSlot(s.id)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow-md hover:scale-110 transition-transform"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openModal && (
        <StandardEntryDialog
          defaultDate={date}
          existingSlots={daySlots}
          existingBookings={dayBookings}
          onClose={() => setOpenModal(false)}
          onSaved={() => {
            setOpenModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
    confirmed: { label: "Confirmado", cls: "bg-primary/15 text-primary" },
    completed: { label: "Concluído", cls: "bg-success/15 text-success" },
    no_show: { label: "Faltou", cls: "bg-destructive/15 text-destructive" },
    cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground line-through" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold mt-1", m.cls)}>
      {m.label}
    </span>
  );
}

// MODAL — Agendamento OU Vaga Livre
function StandardEntryDialog({
  defaultDate,
  existingSlots,
  existingBookings,
  onClose,
  onSaved,
}: {
  defaultDate: string;
  existingSlots: Slot[];
  existingBookings: Booking[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"agendamento" | "vaga_livre">("agendamento");
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [clientSearch, setClientSearch] = useState("");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");

  const [date, setDate] = useState(defaultDate);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [serviceDesc, setServiceDesc] = useState("");
  const [time, setTime] = useState("09:00");

  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [intervalMin, setIntervalMin] = useState(30);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase
        .from("services")
        .select("id, name, duration_minutes, price_cents, image_url")
        .eq("is_active", true)
        .order("name"),
    ]).then(([clientsRes, servicesRes]) => {
      if (clientsRes.data) setClients(clientsRes.data as ClientProfile[]);
      if (servicesRes.data) setServices(servicesRes.data as Service[]);
      setLoadingData(false);
    });
  }, []);

  const handleServiceSelect = (servId: string) => {
    setSelectedServiceId(servId);
    const srv = services.find((s) => s.id === servId);
    if (srv) {
      setDuration(srv.duration_minutes.toString());
      setPrice((srv.price_cents / 100).toFixed(2));
      setIntervalMin(srv.duration_minutes);
      setImageUrl(srv.image_url || "");
    }
  };

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `booking_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("services")
      .upload(path, file, { upsert: true });
    if (error) {
      setUploadingImage(false);
      toast.error("Erro ao enviar imagem: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("services").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploadingImage(false);
  };

  const previewSlots = useMemo(() => {
    if (mode !== "vaga_livre") return [];
    const safeInterval = Math.max(5, intervalMin || 30);
    const result: { start: string; end: string; display: string }[] = [];
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);

    let cur = sh * 60 + sm;
    const end = eh * 60 + em;
    if (cur >= end) return [];

    while (cur + safeInterval <= end) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      const endMinutes = cur + safeInterval;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;

      const startStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      const endStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
      const displayStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      const hasConflict =
        existingBookings.some((b) =>
          checkTimeOverlap(startStr, endStr, b.start_time, b.end_time)
        ) ||
        existingSlots.some((s) =>
          checkTimeOverlap(startStr, endStr, s.start_time, s.end_time)
        );

      if (!hasConflict) result.push({ start: startStr, end: endStr, display: displayStr });
      cur += safeInterval;
    }
    return result;
  }, [startTime, endTime, intervalMin, mode, existingSlots, existingBookings]);

  const save = async () => {
    if (!selectedServiceId) {
      toast.error("Selecione um Serviço.");
      return;
    }
    setSaving(true);

    if (mode === "agendamento") {
      if (!selectedClientId) {
        toast.error("Selecione um cliente.");
        setSaving(false);
        return;
      }

      const priceCents = price
        ? Math.round(parseFloat(price.replace(",", ".")) * 100)
        : 0;
      const startTimeStr = `${time}:00`;
      const [h, m] = time.split(":").map(Number);
      const endMinutes = h * 60 + m + parseInt(duration || "30", 10);
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;

      const conflict = existingBookings.find((b) =>
        checkTimeOverlap(startTimeStr, endTimeStr, b.start_time, b.end_time)
      );
      if (conflict) {
        const clienteNome = conflict.profiles?.full_name ?? "outro cliente";
        const horaConflito = `${conflict.start_time.slice(0, 5)} - ${conflict.end_time.slice(0, 5)}`;
        const servicoNome = conflict.services?.name ?? "serviço";
        const msg = `⚠️ Já existe um agendamento de "${clienteNome}" (${servicoNome}) das ${horaConflito} neste dia. Deseja forçar mesmo assim?`;
        if (!confirm(msg)) {
          setSaving(false);
          return;
        }
      }

      const { error } = await supabase.from("bookings").insert({
        slot_date: date,
        start_time: startTimeStr,
        end_time: endTimeStr,
        status: "confirmed",
        price_cents: priceCents,
        notes: serviceDesc || null,
        client_id: selectedClientId,
        service_id: selectedServiceId,
        image_url: imageUrl || null,
      });

      if (error) {
        const motivo = error.message || "Erro desconhecido";
        if (motivo.toLowerCase().includes("duplicate") || motivo.toLowerCase().includes("conflict")) {
          toast.error(`Conflito de horário: já existe uma reserva neste mesmo intervalo. (${motivo})`);
        } else if (motivo.toLowerCase().includes("permission") || motivo.toLowerCase().includes("policy")) {
          toast.error(`Sem permissão para criar agendamento: ${motivo}`);
        } else {
          toast.error(`Não foi possível salvar. Motivo: ${motivo}`);
        }
      } else {
        toast.success("Agendamento criado!");
        onSaved();
      }
    } else {
      if (previewSlots.length === 0) {
        toast.error("Nenhum horário válido para criar. Verifique início, fim e duração — pode haver conflito com vagas/reservas existentes.");
        setSaving(false);
        return;
      }
      const rows = previewSlots.map((slot) => ({
        slot_date: date,
        start_time: slot.start,
        end_time: slot.end,
        service_id: selectedServiceId,
        image_url: imageUrl || null,
      }));
      const { error } = await supabase.from("availability_slots").insert(rows);
      if (error) {
        toast.error(`Erro ao criar vagas. Motivo: ${error.message}`);
      } else {
        toast.success(`${rows.length} vagas abertas!`);
        onSaved();
      }
    }
    setSaving(false);
  };

  const filteredClients = clients.filter((c) =>
    c.full_name?.toLowerCase().includes(clientSearch.toLowerCase())
  );
  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Adicionar Registro
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setMode("agendamento")}
            className={cn(
              "flex-1 py-3 text-sm font-semibold transition-all",
              mode === "agendamento"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:bg-muted/30"
            )}
          >
            Agendar Cliente
          </button>
          <button
            onClick={() => setMode("vaga_livre")}
            className={cn(
              "flex-1 py-3 text-sm font-semibold transition-all",
              mode === "vaga_livre"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:bg-muted/30"
            )}
          >
            Abrir Vaga(s)
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Foto + Serviço */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => fileRef.current?.click()}
                className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted hover:bg-muted/80 text-muted-foreground"
              >
                {uploadingImage ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={uploadPhoto}
              />
              <span className="text-[10px] text-muted-foreground">Foto (opcional)</span>
            </div>

            <div className="flex-1 space-y-1.5">
              <Label>Serviço Principal *</Label>
              <div className="relative">
                <select
                  value={selectedServiceId}
                  onChange={(e) => handleServiceSelect(e.target.value)}
                  disabled={loadingData}
                  className="w-full h-11 rounded-md border border-input bg-background px-3 pr-9 text-sm appearance-none"
                >
                  <option value="">{loadingData ? "Carregando..." : "Selecione..."}</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {mode === "agendamento" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="space-y-1.5">
                <Label>Cliente *</Label>
                <button
                  type="button"
                  onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                  className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
                >
                  <span className={selectedClient ? "" : "text-muted-foreground"}>
                    {loadingData
                      ? "Carregando..."
                      : selectedClient
                      ? selectedClient.full_name
                      : "Selecionar cliente..."}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {isClientDropdownOpen && (
                  <div className="rounded-md border border-border bg-background shadow-md mt-1">
                    <div className="flex items-center px-3 border-b border-border">
                      <Search className="h-4 w-4 text-muted-foreground mr-2" />
                      <Input
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Buscar..."
                        className="h-10 border-0 shadow-none focus-visible:ring-0 px-0"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredClients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedClientId(c.id);
                            setIsClientDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        >
                          {c.full_name || "Sem nome"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Horário</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor (R$)</Label>
                  <Input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea
                  value={serviceDesc}
                  onChange={(e) => setServiceDesc(e.target.value)}
                  rows={2}
                  className="resize-none"
                  placeholder="Observações (opcional)"
                />
              </div>
            </div>
          )}

          {mode === "vaga_livre" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-primary/5 border border-primary/20 p-3 rounded-xl text-xs text-primary">
                O cliente verá essas vagas atreladas ao serviço{" "}
                <strong>
                  {services.find((s) => s.id === selectedServiceId)?.name ||
                    "selecionado acima"}
                </strong>
                .
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Início</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fim</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tempo (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={intervalMin}
                    onChange={(e) => setIntervalMin(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Pré-visualização ({previewSlots.length} vagas):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {previewSlots.map((s, i) => (
                    <span
                      key={i}
                      className="inline-flex rounded-md bg-background px-2 py-1 text-xs ring-1 ring-border"
                    >
                      {s.display}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-5 pt-4 border-t border-border bg-muted/10 gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving || (mode === "vaga_livre" && previewSlots.length === 0)}
            className="w-full sm:w-auto bg-gradient-gold text-primary-foreground shadow-md"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "agendamento" ? (
              "Salvar Agendamento"
            ) : (
              `Abrir ${previewSlots.length} Vaga(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}