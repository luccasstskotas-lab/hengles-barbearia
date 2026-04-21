import { useEffect, useState } from "react";
import { Bell, Calendar, MessageCircle, Star, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const ICONS = { booking: Calendar, message: MessageCircle, review: Star, system: Sparkles };

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
    const { count } = await supabase.from("notifications").select("*", { count: 'exact', head: true }).eq("user_id", user.id).eq("read", false);
    setNotifications(data || []);
    setUnreadCount(count || 0);
  };

  useEffect(() => {
    if (!user) return;
    loadNotifications();

    const channel = supabase.channel(`bell-realtime-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        setUnreadCount(prev => prev + 1);
        setNotifications(prev => [payload.new, ...prev]);
        toast.info("🔔 " + payload.new.title, { description: payload.new.body });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    await supabase.from("notifications").update({ read: true }).eq("user_id", user?.id);
    setUnreadCount(0);
    loadNotifications();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-all active:scale-95 shadow-lg">
          <Bell className="h-5 w-5 text-white" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-gold px-1.5 text-[10px] font-black text-[#1a1612] shadow-gold animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent align="end" className="w-[320px] rounded-[1.8rem] p-0 bg-[#0d0d0d] border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Notificações</p>
          <button onClick={markAllRead} className="text-[10px] font-black text-gold uppercase hover:opacity-80">Limpar</button>
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-12 text-center opacity-20 text-[10px] uppercase font-black tracking-widest">Tudo limpo por aqui</div>
          ) : (
            notifications.map(n => {
              const Icon = ICONS[n.type as keyof typeof ICONS] || Sparkles;
              return (
                <div key={n.id} className={cn("p-4.5 border-b border-white/5 flex gap-4 transition-colors", !n.read && "bg-white/[0.03]")}>
                  <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5">
                    <Icon className="h-4.5 w-4.5 text-gold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate leading-none">{n.title}</p>
                    <p className="text-[11px] text-white/40 line-clamp-2 mt-1.5 leading-relaxed">{n.body}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}