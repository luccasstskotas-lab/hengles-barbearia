import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { formatPrice, formatDuration, formatTime } from "@/lib/format";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Scissors, Loader2, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/agendar")({
  component: BookingPage,
});

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  image_url: string | null;
}

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  service_id: string | null;
}

interface Booking {
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

function checkTimeOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && endA > startB;
}

function addMinutes(timeStr: string, mins: number) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + mins;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}:00`;
}

function BookingPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const todayStr = startOfDay(new Date()).toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAdmin) navigate({ to: "/app" });
  }, [isAdmin, navigate]);

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = addDays(new Date(), 30).toISOString().slice(0, 10);
    const [srvRes, slotsRes, bookRes] = await Promise.all([
      supabase.from("services").select("*").eq("is_active", true).order("name"),
      supabase.from("availability_slots").select("*").gte("slot_date", today).lte("slot_date", horizon).order("slot_date").order("start_time"),
      supabase.from("bookings").select("slot_date, start_time, end_time, status").gte("slot_date", today).neq("status", "cancelled")
    ]);
    if (srvRes.data) setServices(srvRes.data);
    if (slotsRes.data) setSlots(slotsRes.data);
    if (bookRes.data) setBookings(bookRes.data);
  }, []);

  useEffect(() => {
    loadData();
    const ch = supabase.channel("agenda-live").on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, loadData).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadData]);

  const isTaken = useCallback((date: string, slotStart: string) => {
    if (!selectedService) return false;
    const projectedEnd = addMinutes(slotStart, selectedService.duration_minutes);
    return bookings.some(b => b.slot_date === date && checkTimeOverlap(slotStart, projectedEnd, b.start_time, b.end_time));
  }, [bookings, selectedService]);

  const days = useMemo(() => Array.from({ length: 14 }).map((_, i) => addDays(new Date(), i).toISOString().slice(0, 10)), []);
  const validSlotsForDay = useMemo(() => {
    if (!selectedService) return [];
    return slots.filter(s => s.slot_date === selectedDate && (s.service_id === null || s.service_id === selectedService.id));
  }, [slots, selectedService, selectedDate]);

  const handleConfirm = async () => {
    if (!selectedService || !selectedTime || !user) return;
    setSubmitting(true);
    const endTimeStr = addMinutes(selectedTime, selectedService.duration_minutes);
    const { error } = await supabase.from("bookings").insert({
      client_id: user.id,
      service_id: selectedService.id,
      slot_date: selectedDate,
      start_time: selectedTime,
      end_time: endTimeStr,
      price_cents: selectedService.price_cents,
      status: "confirmed",
      notes: `${selectedService.name} (Pelo App)`
    });
    if (error) {
      toast.error("Erro ao agendar.");
      setSubmitting(false);
      loadData();
    } else {
      toast.success("Agendado com sucesso!");
      navigate({ to: "/app/perfil" });
    }
  };

  return (
    <div className="px-5 pt-6 pb-24">
      <header><h1 className="font-display text-2xl">Agendar</h1><p className="text-sm text-muted-foreground">Escolha o serviço e horário</p></header>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">1. Qual serviço?</h2>
        <ul className="flex flex-col gap-3">
          {services.map((s) => (
            <li key={s.id}>
              <button onClick={() => { setSelectedService(s); setSelectedTime(null); }} className={cn("flex w-full items-start gap-4 rounded-2xl border bg-card p-4 text-left transition-all", selectedService?.id === s.id ? "border-primary shadow-gold ring-1 ring-primary" : "border-border")}>
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/50 border border-border">
                  {s.image_url ? <img src={s.image_url} className="h-full w-full object-cover" /> : <Scissors className="h-6 w-6 text-muted-foreground" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.name}</p>
                  {s.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                  <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mt-2"><Clock className="w-3 h-3" /> {formatDuration(s.duration_minutes)}</p>
                </div>
                <div className="text-right flex flex-col items-end"><p className="text-sm font-bold">{formatPrice(s.price_cents)}</p></div>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className={cn("mt-8 transition-all", !selectedService && "opacity-40 pointer-events-none")}>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">2. Qual dia?</h2>
        <div className="-mx-5 overflow-x-auto px-5 pb-1 scrollbar-hide">
          <div className="flex gap-2">
            {days.map((d) => (
              <button key={d} onClick={() => { setSelectedDate(d); setSelectedTime(null); }} className={cn("flex w-14 shrink-0 flex-col items-center rounded-2xl border px-2 py-2 transition-all", selectedDate === d ? "border-primary bg-primary text-primary-foreground shadow-gold" : "border-border bg-card")}>
                <span className="text-[10px] uppercase">{format(parseISO(d), "EEE", { locale: ptBR })}</span>
                <span className="font-display text-lg leading-none mt-0.5 mb-0.5">{format(parseISO(d), "d")}</span>
                <span className="text-[10px]">{format(parseISO(d), "MMM", { locale: ptBR })}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className={cn("mt-8 transition-all", !selectedService && "opacity-40 pointer-events-none")}>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">3. E o horário?</h2>
        <div className="grid grid-cols-3 gap-3">
          {validSlotsForDay.map((s) => {
            const taken = isTaken(s.slot_date, s.start_time);
            return (
              <button key={s.id} disabled={taken} onClick={() => setSelectedTime(s.start_time)} className={cn("rounded-xl border px-2 py-3 text-sm font-bold transition-all", taken ? "border-border bg-muted/50 text-muted-foreground/50 line-through opacity-40" : selectedTime === s.start_time ? "border-primary bg-primary text-primary-foreground shadow-gold" : "border-success/30 bg-card hover:border-primary")}>
                {formatTime(s.start_time)}
              </button>
            );
          })}
        </div>
      </section>
      <Button disabled={!selectedService || !selectedTime || submitting} onClick={handleConfirm} className="mt-10 h-14 w-full bg-gradient-gold text-primary-foreground shadow-gold text-lg font-bold">
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirmar Agendamento"}
      </Button>
    </div>
  );
}