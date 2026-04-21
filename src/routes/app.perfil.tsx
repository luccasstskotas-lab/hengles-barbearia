import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera, LogOut, Moon, Sun, Loader2, Calendar, X, Users, ShieldCheck, KeyRound, MessageCircle, ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatTime, formatPrice } from "@/lib/format";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/perfil")({
  component: ProfilePage,
});

interface MyBooking {
  id: string;
  slot_date: string;
  start_time: string;
  status: string;
  price_cents: number;
  services: { name: string } | null;
}

function ProfilePage() {
  const { user, profile, refreshProfile, signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [pwd, setPwd] = useState("");
  
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);

  useEffect(() => {
    setName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  useEffect(() => {
    if (!user || isAdmin) return;
    
    const fetchMine = () =>
      supabase
        .from("bookings")
        .select("id, slot_date, start_time, status, price_cents, services(name)")
        .eq("client_id", user.id)
        .order("slot_date", { ascending: false })
        .limit(20)
        .then(({ data }) => setMyBookings((data as unknown as MyBooking[]) ?? []));
        
    fetchMine();
    
    const ch = supabase
      .channel(`my-bookings-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `client_id=eq.${user.id}` }, fetchMine)
      .subscribe();
      
    return () => { supabase.removeChannel(ch); };
  }, [user, isAdmin]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() || null }).eq("id", user.id);
    setSavingProfile(false);
    
    if (error) { toast.error("Erro ao salvar perfil"); return; }
    toast.success("Perfil atualizado com sucesso!");
    refreshProfile();
  };

  const changePassword = async () => {
    if (pwd.length < 6) { toast.error("A senha precisa ter ao menos 6 caracteres"); return; }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    
    if (error) { toast.error("Erro ao trocar senha"); return; }
    setPwd("");
    toast.success("Senha alterada com sucesso!");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande (máx 5MB)"); return; }
    
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (upErr) { setUploading(false); toast.error("Erro ao enviar foto"); return; }
    
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
    
    setUploading(false);
    toast.success("Foto de perfil atualizada!");
    refreshProfile();
  };

  const cancelBooking = async (id: string) => {
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error("Erro ao cancelar"); return; }
    
    setMyBookings((bs) => bs.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
    toast.success("Agendamento cancelado");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="px-5 pt-6 pb-24 bg-background transition-colors duration-300">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-0.5">Gestão de conta</p>
        </div>
        <NotificationBell />
      </header>

      {/* FOTO DE PERFIL */}
      <section className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
        <div className="relative">
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] border-2 border-primary/30 bg-muted text-3xl font-bold uppercase text-muted-foreground shadow-lg ring-4 ring-background">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              (profile?.full_name ?? "?").slice(0, 1)
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-gold text-[#1a1612] shadow-gold transition-transform active:scale-90 border-2 border-background"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        </div>
        <h2 className="mt-4 font-bold text-lg text-foreground">{profile?.full_name || "Cliente"}</h2>
      </section>

      {/* DADOS PESSOAIS */}
      <section className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-elegant">
        <h2 className="mb-4 font-display text-base font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary"/> Dados Pessoais
        </h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Nome Completo</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl bg-muted/50 border-transparent focus:border-primary focus:bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Telefone / WhatsApp</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="h-12 rounded-xl bg-muted/50 border-transparent focus:border-primary focus:bg-background" />
          </div>
          <Button onClick={saveProfile} disabled={savingProfile} className="w-full h-12 rounded-xl bg-gradient-gold text-[#1a1612] shadow-gold font-bold transition-transform active:scale-95">
            {savingProfile ? <Loader2 className="h-5 w-5 animate-spin" /> : "Salvar Alterações"}
          </Button>
        </div>
      </section>

      {/* TROCAR SENHA */}
      <section className="mt-5 rounded-3xl border border-border bg-card p-6 shadow-elegant">
        <h2 className="mb-4 font-display text-base font-bold text-foreground flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary"/> Segurança
        </h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Nova Senha</Label>
            <Input type="password" placeholder="Mínimo 6 caracteres" value={pwd} onChange={(e) => setPwd(e.target.value)} className="h-12 rounded-xl bg-muted/50 border-transparent focus:border-primary focus:bg-background" />
          </div>
          <Button onClick={changePassword} disabled={savingPwd || !pwd} variant="outline" className="w-full h-12 rounded-xl border-border text-foreground hover:bg-muted">
            {savingPwd ? <Loader2 className="h-5 w-5 animate-spin" /> : "Atualizar Senha"}
          </Button>
        </div>
      </section>

      {/* TEMA */}
      <section className="mt-5 flex items-center justify-between rounded-3xl border border-border bg-card p-6 shadow-elegant">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/10">
            {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Modo Escuro</p>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Mude a aparência do aplicativo</p>
          </div>
        </div>
        <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} className="data-[state=checked]:bg-primary" />
      </section>

      {/* PAINEL ADMIN */}
      {isAdmin && (
        <section className="mt-5">
          <AdminUsersPanel />
        </section>
      )}

      {/* MEUS AGENDAMENTOS (CLIENTE) */}
      {!isAdmin && (
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between border-l-2 border-primary pl-3">
            <h2 className="font-display text-lg font-bold text-foreground">Meus Agendamentos</h2>
            <Link to="/app/chat">
              <Button variant="ghost" className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10">
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Falar no Chat
              </Button>
            </Link>
          </div>

          {myBookings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center bg-card/50 shadow-inner">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground opacity-30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Você ainda não tem agendamentos.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {myBookings.map((b) => {
                const isActionable = b.status === "confirmed" || b.status === "pending";
                return (
                  <li key={b.id} className="flex items-center gap-4 rounded-3xl border border-border bg-card p-4 shadow-elegant transition-all hover:border-primary/20">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted border border-border">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                        {format(parseISO(b.slot_date), "MMM", { locale: ptBR })}
                      </span>
                      <span className="text-base font-black text-foreground leading-none">
                        {format(parseISO(b.slot_date), "d")}
                      </span>
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{b.services?.name ?? "Serviço"}</p>
                      <p className="text-[11px] font-medium text-muted-foreground mt-0.5 mb-1.5">
                        {formatTime(b.start_time)} • {formatPrice(b.price_cents)}
                      </p>
                      <StatusBadge status={b.status} />
                    </div>

                    {isActionable && (
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/app/chat"
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                          aria-label="Chat sobre agendamento"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Link>
                        {b.status === "confirmed" && (
                          <button
                            onClick={() => cancelBooking(b.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all"
                            aria-label="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {/* BOTÃO SAIR */}
      <Button variant="outline" onClick={handleSignOut} className="mt-10 w-full h-12 rounded-xl border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground font-bold transition-colors">
        <LogOut className="mr-2 h-5 w-5" />
        Sair da Conta
      </Button>
    </div>
  );
}

// COMPONENTES AUXILIARES (Badge e Painel Admin mantidos)
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string }> = {
    pending: { label: "Pendente", class: "bg-amber-500/15 text-amber-500 border-amber-500/20" },
    confirmed: { label: "Confirmado", class: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" },
    completed: { label: "Concluído", class: "bg-primary/15 text-primary border-primary/20" },
    cancelled: { label: "Cancelado", class: "bg-destructive/15 text-destructive border-destructive/20" },
    no_show: { label: "Faltou", class: "bg-muted text-muted-foreground border-border" },
  };
  const current = map[status] ?? { label: status, class: "bg-muted text-foreground" };
  return <span className={cn("inline-flex px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest", current.class)}>{current.label}</span>;
}

function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [open, setOpen] = useState<AdminUserRow | null>(null);
  const load = () => { supabase.from("profiles").select("id, full_name, is_banned, avatar_url").order("full_name").then(({ data }) => setUsers(data ?? [])); };
  useEffect(load, []);
  const toggleBan = async (u: AdminUserRow) => {
    const { error } = await supabase.from("profiles").update({ is_banned: !u.is_banned }).eq("id", u.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success(u.is_banned ? "Acesso restaurado!" : "Usuário banido.");
    setOpen(null); load();
  };
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-elegant transition-colors">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-base font-bold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Gerenciar Acessos</h2><span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{users.length} usuários</span></div>
      <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto scrollbar-hide pr-1">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/30 p-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-xs font-bold uppercase ring-1 ring-border text-muted-foreground">{u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : (u.full_name ?? "?").slice(0, 1)}</span>
            <div className="flex-1 min-w-0"><p className="truncate text-sm font-bold text-foreground">{u.full_name || "Cliente"}</p><p className={cn("text-[10px] font-bold uppercase tracking-widest mt-0.5", u.is_banned ? "text-destructive" : "text-emerald-500")}>{u.is_banned ? "Banido" : "Ativo"}</p></div>
            <Button size="sm" variant={u.is_banned ? "outline" : "destructive"} onClick={() => setOpen(u)} className={cn("h-8 px-3 rounded-lg text-xs font-bold", u.is_banned ? "border-border text-muted-foreground" : "")}>{u.is_banned ? "Desbanir" : "Banir"}</Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-3xl p-6 bg-card border-border"><DialogHeader><DialogTitle className="text-xl font-bold text-foreground">{open?.is_banned ? "Restaurar Acesso" : "Banir Usuário"}</DialogTitle><DialogDescription className="pt-2 text-sm text-muted-foreground">{open?.is_banned ? `Você está prestes a devolver o acesso para ${open?.full_name}.` : `Banir ${open?.full_name}? Ele perderá o acesso imediatamente.`}</DialogDescription></DialogHeader><DialogFooter className="mt-4 flex gap-2"><Button variant="outline" onClick={() => setOpen(null)} className="flex-1 rounded-xl">Cancelar</Button><Button variant={open?.is_banned ? "default" : "destructive"} onClick={() => open && toggleBan(open)} className="flex-1 rounded-xl font-bold">Confirmar</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

interface AdminUserRow { id: string; full_name: string; is_banned: boolean; avatar_url: string | null; }