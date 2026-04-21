import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Star, Loader2, Sparkles, Quote, MessageSquarePlus, 
  Camera, X, ClipboardCheck, Trash2, MessageCircleReply, CornerDownRight 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatTime } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/app/avaliacoes")({
  component: ReviewsPage,
});

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  admin_reply: string | null;
  image_url: string | null;
  created_at: string;
  client_id: string;
  profiles?: { full_name: string; avatar_url: string | null } | null;
}

interface PendingBooking {
  id: string;
  slot_date: string;
  start_time: string;
  services: { name: string } | null;
}

function ReviewsPage() {
  const { user, isAdmin } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pending, setPending] = useState<PendingBooking[]>([]);
  
  // Modal de criar avaliação (Cliente)
  const [open, setOpen] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal de responder (Admin)
  const [replyingTo, setReplyingTo] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSavingReply, setIsSavingReply] = useState(false);

  const load = useCallback(async () => {
    const { data: reviewsData, error: reviewsError } = await supabase
      .from("reviews")
      .select("id, rating, comment, admin_reply, image_url, created_at, client_id")
      .order("created_at", { ascending: false })
      .limit(50);
      
    if (reviewsError) {
      toast.error(`Erro ao buscar avaliações: ${reviewsError.message}`);
      return;
    }

    if (reviewsData && reviewsData.length > 0) {
      const clientIds = [...new Set(reviewsData.map(r => r.client_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", clientIds);

      const combined = reviewsData.map(review => ({
        ...review,
        profiles: profilesData?.find(p => p.id === review.client_id) || null
      }));

      setReviews(combined as Review[]);
    } else {
      setReviews([]);
    }

    if (user && !isAdmin) {
      const { data: pendingData } = await supabase
        .from("bookings")
        .select("id, slot_date, start_time, services(name)")
        .eq("client_id", user.id)
        .eq("status", "completed")
        .order("slot_date", { ascending: false });

      const { data: existingReviews } = await supabase
        .from("reviews")
        .select("booking_id")
        .eq("client_id", user.id);

      const reviewedIds = new Set((existingReviews ?? []).map((r: any) => r.booking_id));
      setPending(((pendingData as PendingBooking[]) ?? []).filter((b) => !reviewedIds.has(b.id)));
    }
  }, [user, isAdmin]);

  useEffect(() => {
    load();
    const ch = supabase.channel("reviews-live").on("postgres_changes", { event: "*", schema: "public", table: "reviews" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const path = `review_${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("services").upload(path, file, { upsert: true });
    if (error) {
      setUploadingImage(false);
      toast.error(`Erro na foto: ${error.message}`);
      return;
    }
    const { data } = supabase.storage.from("services").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploadingImage(false);
  };

  const removePhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImageUrl("");
  };

  const submitReview = async () => {
    if (!user || !open) return;
    setSubmitting(true);
    const bookingId = open === "generic" ? null : open;
    const { error } = await supabase.from("reviews").insert({
      booking_id: bookingId,
      client_id: user.id,
      rating,
      comment: comment.trim() || null,
      image_url: imageUrl || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(`Erro ao enviar: ${error.message}`);
      return;
    }
    toast.success("Avaliação enviada!");
    setOpen(null); setComment(""); setRating(5); setImageUrl("");
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Tem certeza?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluída!");
    load();
  };

  const handleReplySubmit = async () => {
    if (!replyingTo || !replyText.trim()) return;
    setIsSavingReply(true);
    const { error } = await supabase.from("reviews").update({ admin_reply: replyText.trim() }).eq("id", replyingTo.id);
    setIsSavingReply(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Respondido!");
    setReplyingTo(null); setReplyText(""); load();
  };

  const { avg, dist } = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, dist: [0, 0, 0, 0, 0] };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    const d = [0, 0, 0, 0, 0];
    reviews.forEach((r) => { d[r.rating - 1]++; });
    return { avg: sum / reviews.length, dist: d };
  }, [reviews]);

  return (
    <div className="px-5 pt-6 pb-24">
      <AppHeader title="Avaliações" subtitle="O que dizem da Hengles" />

      {/* Resumo */}
      <section className="mt-5 rounded-3xl border border-border bg-card p-6 shadow-elegant">
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-3xl bg-gradient-gold text-[#1a1612] shadow-gold">
            <span className="font-display text-4xl font-bold leading-none">{avg.toFixed(1)}</span>
            <div className="mt-1.5 flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn("h-3 w-3", n <= Math.round(avg) ? "fill-[#1a1612] text-[#1a1612]" : "text-[#1a1612]/30")} />
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = dist[stars - 1];
              const pct = reviews.length === 0 ? 0 : (count / reviews.length) * 100;
              return (
                <div key={stars} className="flex items-center gap-2 text-[11px]">
                  <span className="w-3 text-right font-medium text-muted-foreground">{stars}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                    <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right font-mono text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {user && !isAdmin && (
          <Button onClick={() => setOpen("generic")} className="w-full mt-6 h-12 rounded-xl bg-gradient-gold text-[#1a1612] shadow-gold font-bold transition-transform active:scale-95">
            <MessageSquarePlus className="mr-2 h-5 w-5" /> Deixar minha avaliação
          </Button>
        )}
      </section>

      {/* Pendentes */}
      {pending.length > 0 && (
        <section className="mt-7 animate-in fade-in slide-in-from-top-3">
          <h2 className="text-sm font-bold text-foreground mb-3 px-1">Cortes para avaliar</h2>
          <ul className="space-y-2.5">
            {pending.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.services?.name ?? "Corte"}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{format(parseISO(b.slot_date), "d 'de' MMMM", { locale: ptBR })}</p>
                </div>
                <Button size="sm" onClick={() => setOpen(b.id)} className="bg-gradient-gold text-[#1a1612] text-[10px] font-bold h-8 rounded-lg uppercase">Avaliar</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mural */}
      <section className="mt-8">
        <h2 className="mb-4 font-display text-lg font-bold border-b border-border pb-2">Mural de Depoimentos</h2>
        <ul className="flex flex-col gap-5">
          {reviews.map((r) => (
            <li key={r.id} className="relative rounded-2xl border border-border bg-card p-5 shadow-elegant">
              <div className="flex items-start gap-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-bold uppercase text-muted-foreground ring-1 ring-primary/20">
                  {r.profiles?.avatar_url ? <img src={r.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : (r.profiles?.full_name?.slice(0, 1) ?? "?")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.profiles?.full_name ?? "Cliente"}</p>
                  <p className="text-[9px] uppercase font-bold text-muted-foreground">{format(parseISO(r.created_at), "d MMM, yyyy", { locale: ptBR })}</p>
                </div>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(n => <Star key={n} className={cn("h-2.5 w-2.5", n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground/30")}/>)}
                </div>
              </div>
              {r.comment && <p className="mt-3 text-sm italic text-foreground/80 leading-relaxed">"{r.comment}"</p>}
              {r.image_url && <img src={r.image_url} className="mt-4 rounded-xl border border-border w-full max-h-60 object-cover" loading="lazy" />}
              {r.admin_reply && (
                <div className="mt-4 ml-4 rounded-xl border border-primary/20 bg-primary/5 p-3 relative">
                  <CornerDownRight className="absolute -left-4 top-2 h-3 w-3 text-primary/40" />
                  <p className="text-[9px] font-black uppercase text-primary mb-1">Hengles respondeu:</p>
                  <p className="text-xs font-medium text-foreground/90 leading-tight">{r.admin_reply}</p>
                </div>
              )}
              {isAdmin && (
                <div className="mt-4 flex items-center gap-2 pt-3 border-t border-border/50">
                  <Button size="sm" variant="outline" onClick={() => { setReplyingTo(r); setReplyText(r.admin_reply || ""); }} className="flex-1 h-8 text-[10px] font-bold uppercase">Responder</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)} className="h-8 w-10"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* MODAL CLIENTE */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[90%] rounded-3xl bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary"/> Avaliar Experiência</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} className="transition-transform active:scale-90">
                  <Star className={cn("h-10 w-10", n <= (hover ?? rating) ? "fill-primary text-primary" : "text-muted-foreground/20")} />
                </button>
              ))}
            </div>
            {imageUrl ? (
              <div className="relative h-32 rounded-xl overflow-hidden border border-border">
                <img src={imageUrl} className="h-full w-full object-cover" />
                <button onClick={removePhoto} className="absolute top-1 right-1 bg-black/70 p-1 rounded-full text-white"><X className="w-3 h-3"/></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/40">
                {uploadingImage ? <Loader2 className="animate-spin" /> : <><Camera className="w-5 h-5 mb-1"/><span className="text-[10px] font-bold uppercase">Foto do Corte</span></>}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadPhoto} />
            <Textarea placeholder="Opcional: Deixe um comentário sobre o atendimento..." value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="rounded-xl text-sm" />
          </div>
          <DialogFooter className="flex flex-col gap-2">
            <Button onClick={submitReview} disabled={submitting || uploadingImage} className="w-full bg-gradient-gold text-[#1a1612] font-bold rounded-xl h-12 shadow-gold">
              {submitting ? <Loader2 className="animate-spin" /> : "ENVIAR AGORA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL ADMIN RESPONDER */}
      <Dialog open={!!replyingTo} onOpenChange={(o) => !o && setReplyingTo(null)}>
        <DialogContent className="max-w-[90%] rounded-3xl bg-background border-border">
          <DialogHeader><DialogTitle>Responder Avaliação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-muted/30 p-3 text-xs italic">"{replyingTo?.comment || "Sem comentário."}"</div>
            <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Sua resposta..." rows={4} className="rounded-xl text-sm" />
          </div>
          <DialogFooter>
            <Button onClick={handleReplySubmit} disabled={isSavingReply || !replyText.trim()} className="w-full bg-gradient-gold text-[#1a1612] font-bold rounded-xl h-12">
              {isSavingReply ? <Loader2 className="animate-spin" /> : "SALVAR RESPOSTA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}