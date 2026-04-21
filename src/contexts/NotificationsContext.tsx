import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Bell, Calendar, MessageCircle, Star, Info } from "lucide-react";

export interface AppNotification {
  id: string;
  type: "booking" | "message" | "review" | "system";
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface Ctx {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
}

const NotificationsContext = createContext<Ctx | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    // Carrega as últimas 50 notificações
    const load = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
        
      if (!error && data) {
        setNotifications(data as AppNotification[]);
      }
    };
    
    load();

    // Fica ouvindo novas notificações em tempo real
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as AppNotification;
          setNotifications((cur) => [n, ...cur].slice(0, 50));
          
          // Lógica Premium Hengles: Ícones personalizados no Toast
          let NotifIcon = Bell;
          if (n.type === "booking") NotifIcon = Calendar;
          if (n.type === "message") NotifIcon = MessageCircle;
          if (n.type === "review") NotifIcon = Star;
          if (n.type === "system") NotifIcon = Info;

          toast(n.title, { 
            description: n.body ?? undefined,
            icon: <NotifIcon className="h-5 w-5 text-gold" />,
            className: "border-border bg-card text-foreground shadow-elegant",
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as AppNotification;
          setNotifications((cur) => cur.map((x) => (x.id === n.id ? n : x)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    
    // Atualização otimista na interface (instantâneo)
    setNotifications((cur) => cur.map((n) => ({ ...n, is_read: true })));
    
    // Atualiza no banco em background
    const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    if (error) console.error("Erro ao marcar todas como lidas:", error);
  };

  const markRead = async (id: string) => {
    // Atualização otimista na interface
    setNotifications((cur) => cur.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) console.error("Erro ao marcar notificação como lida:", error);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead, markRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications deve ser usado dentro de um NotificationsProvider");
  return ctx;
}