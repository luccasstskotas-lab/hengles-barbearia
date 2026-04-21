import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Ban, Trash2, ShieldCheck, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils"; // O IMPORT QUE ESTAVA FALTANDO AQUI!

export const Route = createFileRoute("/app/usuarios")({
  component: UsuariosPage,
});

interface UserRow {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  is_online: boolean;
  created_at: string;
  role: "admin" | "client";
}

function UsuariosPage() {
  const { isAdmin, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate({ to: "/app" });
  }, [authLoading, isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone, avatar_url, is_banned, is_online, created_at")
      .order("created_at", { ascending: false });

    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    
    const map = new Map<string, "admin" | "client">();
    (roles ?? []).forEach((r: any) => map.set(r.user_id, r.role));

    setRows(
      (profiles ?? []).map((p: any) => ({
        ...p,
        role: map.get(p.id) ?? "client",
      }))
    );
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => 
      (r.full_name || "").toLowerCase().includes(q) || 
      (r.phone ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const handleBan = async (row: UserRow) => {
    setBusyId(row.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_banned: !row.is_banned })
        .eq("id", row.id);

      if (error) throw error;

      toast.success(row.is_banned ? "Usuário liberado" : "Usuário bloqueado");
      setRows(cur => cur.map(r => r.id === row.id ? { ...r, is_banned: !r.is_banned } : r));
    } catch (e: any) {
      toast.error("Erro ao atualizar: " + e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="px-5 pt-6 pb-24 min-h-screen bg-black text-white">
      <header className="flex items-center justify-between">
        <BrandLogo />
        <div className="text-right">
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Controle</p>
          <p className="text-sm font-black text-[#D4AF37]">Usuários</p>
        </div>
      </header>

      <div className="mt-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="h-12 rounded-2xl pl-10 bg-white/5 border-white/10 text-white focus-visible:ring-[#D4AF37]"
          />
        </div>
      </div>

      <div className="mt-4 text-[10px] uppercase font-black tracking-widest text-white/30">
        {loading ? "Sincronizando..." : `${filtered.length} Clientes na base`}
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {filtered.map((row) => (
          <li key={row.id} className="flex items-center gap-4 rounded-[1.5rem] border border-white/5 bg-[#0d0d0d] p-4 shadow-xl">
            <div className="relative">
              {row.avatar_url ? (
                <img src={row.avatar_url} className="h-12 w-12 rounded-2xl object-cover border border-white/10" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white/40 border border-white/10">
                  <UserIcon className="h-6 w-6" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-white">{row.full_name || "Sem nome"}</p>
                {row.is_banned && (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[8px] font-black text-red-500 uppercase tracking-tighter">Bloqueado</span>
                )}
              </div>
              <p className="truncate text-[11px] text-white/40 font-medium">{row.phone ?? "Sem telefone"}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={busyId === row.id || row.id === user?.id}
                onClick={() => handleBan(row)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border transition-all active:scale-90 disabled:opacity-30",
                  row.is_banned 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                    : "bg-red-500/10 border-red-500/20 text-red-500"
                )}
              >
                {busyId === row.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : row.is_banned ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <Ban className="h-5 w-5" />
                )}
              </button>
            </div>
          </li>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center border border-dashed border-white/5 rounded-[2rem]">
            <p className="text-sm text-white/20 font-bold uppercase tracking-widest">Ninguém encontrado</p>
          </div>
        )}
      </ul>
    </div>
  );
}