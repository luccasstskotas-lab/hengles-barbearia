import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChatView } from "@/components/ChatView";
import { AppHeader } from "@/components/AppHeader";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/conversas")({
  component: ConversationsPage,
});

interface ConversationRow {
  id: string;
  client_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  admin_unread_count: number;
  client: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    is_online: boolean;
    last_seen_at: string | null;
  } | null;
}

function ConversationsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [active, setActive] = useState<ConversationRow | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app/chat" });
  }, [isAdmin, loading, navigate]);

  // Initial load + realtime
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, client_id, last_message_at, last_message_preview, admin_unread_count")
        .order("last_message_at", { ascending: false });
      if (cancelled || !data) return;
      const ids = data.map((c) => c.client_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, is_online, last_seen_at")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      setConversations(
        data.map((c) => ({ ...c, client: (map.get(c.client_id) as ConversationRow["client"]) ?? null }))
      );
    };

    load();

    const ch = supabase
      .channel("admin-convs")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        // Incremental update — no full reload
        const row = (payload.new ?? payload.old) as Partial<ConversationRow> & { id: string };
        if (payload.eventType === "DELETE") {
          setConversations((cur) => cur.filter((c) => c.id !== row.id));
          return;
        }
        setConversations((cur) => {
          const idx = cur.findIndex((c) => c.id === row.id);
          if (idx >= 0) {
            const next = [...cur];
            next[idx] = { ...next[idx], ...row } as ConversationRow;
            return next.sort(
              (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            );
          }
          // New conversation: fetch profile and prepend
          load();
          return cur;
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const p = payload.new as ConversationRow["client"];
        if (!p) return;
        setConversations((cur) => cur.map((c) => (c.client_id === p.id ? { ...c, client: p } : c)));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [isAdmin]);

  const filtered = search.trim()
    ? conversations.filter((c) =>
        (c.client?.full_name ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : conversations;

  // Mobile: when active, only show chat. Desktop (sm+): split pane (list + chat).
  if (active && active.client) {
    return (
      <div className="flex h-[100dvh] flex-col sm:flex-row">
        {/* Sidebar (desktop only) */}
        <aside className="hidden w-72 shrink-0 border-r border-border/60 bg-card sm:flex sm:flex-col">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="font-display text-base">Conversas</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ConversationList
              items={filtered}
              activeId={active.id}
              onSelect={(c) => setActive(c)}
            />
          </div>
        </aside>
        {/* Chat */}
        <div className="flex-1 min-w-0">
          <ChatView
            conversationId={active.id}
            partner={active.client}
            onBack={() => setActive(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6">
      <AppHeader title="Conversas" subtitle="Mensagens dos clientes" />
      <div className="mt-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente"
          className="w-full rounded-2xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-2 h-6 w-6" />
            {search ? "Nenhum cliente encontrado." : "Nenhuma conversa ainda."}
          </div>
        ) : (
          <ConversationList items={filtered} onSelect={setActive} />
        )}
      </div>
    </div>
  );
}

function ConversationList({
  items,
  activeId,
  onSelect,
}: {
  items: ConversationRow[];
  activeId?: string;
  onSelect: (c: ConversationRow) => void;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((c) => (
        <li key={c.id}>
          <button
            onClick={() => onSelect(c)}
            className={cn(
              "tap-scale flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-elegant transition-colors hover:bg-muted",
              activeId === c.id && "border-primary/60 bg-primary/5"
            )}
          >
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold uppercase">
                {c.client?.avatar_url ? (
                  <img src={c.client.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  (c.client?.full_name ?? "?").slice(0, 1)
                )}
              </div>
              {c.client?.is_online && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{c.client?.full_name ?? "Cliente"}</p>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(parseISO(c.last_message_at), { addSuffix: false, locale: ptBR })}
                </span>
              </div>
              <p
                className={cn(
                  "truncate text-xs",
                  c.admin_unread_count ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {c.last_message_preview ?? "Conversa iniciada"}
              </p>
            </div>
            {c.admin_unread_count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {c.admin_unread_count}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
