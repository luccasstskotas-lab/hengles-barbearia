import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChatView } from "@/components/ChatView";
import { FullScreenLoader } from "@/components/FullScreenLoader";

const searchSchema = z.object({
  draft: z.string().optional(),
});

export const Route = createFileRoute("/app/chat")({
  validateSearch: searchSchema,
  component: ClientChatPage,
});

interface AdminPartner {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
}

function ClientChatPage() {
  const { user, isAdmin, loading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminPartner | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (isAdmin) {
      navigate({ to: "/app/conversas" });
      return;
    }
    if (!user) return;
    let cancelled = false;
    const init = async () => {
      const [convRes, adminRes] = await Promise.all([
        supabase.rpc("get_or_create_my_conversation" as never),
        supabase.rpc("get_admin_profile" as never),
      ]);
      if (cancelled) return;
      if (convRes.error) {
        setError("Não foi possível abrir a conversa.");
        return;
      }
      setConversationId(convRes.data as unknown as string);
      const adminRows = adminRes.data as unknown as AdminPartner[] | null;
      if (adminRows && adminRows.length > 0) {
        setAdmin(adminRows[0]);
      } else {
        setError("Nenhum administrador disponível para conversa.");
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, loading, navigate]);

  if (error) {
    return (
      <div className="flex h-[80dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground font-medium">{error}</p>
      </div>
    );
  }

  if (!conversationId || !admin) return <FullScreenLoader />;

  return (
    /* Ajuste Mobile: 
      - h-[calc(100dvh-4rem)] desconta a altura do seu header/menu (aprox 64px).
      - overflow-hidden no container pai evita o scroll duplo no celular.
    */
    <div className="flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-background">
      <ChatView
        conversationId={conversationId}
        partner={admin}
        onBack={() => navigate({ to: "/app" })}
        initialDraft={search.draft}
      />
    </div>
  );
}