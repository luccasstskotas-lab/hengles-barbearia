import { useEffect, useState } from "react";
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext"; // Adicionei useAuth aqui
import { supabase } from "@/integrations/supabase/client";
import { Coffee, Clock } from "lucide-react";

import appCss from "../styles.css?url";

interface StoreStatus {
  is_paused: boolean;
  message: string;
  return_time: string;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Página não encontrada
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O conteúdo que você procura não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function PauseScreen({ status }: { status: StoreStatus }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-md p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Aplicativo temporariamente pausado"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#D4AF37]/20 bg-gradient-to-b from-[#1a1a1a] to-black p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10">
          <Coffee className="h-10 w-10 text-[#D4AF37]" />
        </div>

        <h1 className="mb-3 text-2xl font-bold text-white">Pausa Rápida</h1>

        <p className="mb-6 text-base leading-relaxed text-white/70">
          {status.message ||
            "Estamos em horário de almoço ou em uma pausa rápida. Voltamos em breve!"}
        </p>

        {status.return_time && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-2 font-semibold text-[#D4AF37]">
            <Clock className="h-4 w-4" />
            Retorno às {status.return_time}
          </div>
        )}

        <p className="mt-4 text-xs uppercase tracking-[0.24em] text-white/40">
          Hengles Barbearia
        </p>
      </div>
    </div>
  );
}

function PauseGate() {
  const location = useLocation();
  const { isAdmin } = useAuth(); // Pegando a permissão de admin direto do contexto

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StoreStatus>({
    is_paused: false,
    message: "",
    return_time: "",
  });

  useEffect(() => {
    let mounted = true;

    const loadStatus = async () => {
      const { data, error } = await supabase
        .from("store_status")
        .select("is_paused, message, return_time")
        .eq("id", 1)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("[PauseGate] erro ao carregar store_status:", error);
      }

      if (data) {
        setStatus({
          is_paused: !!data.is_paused,
          message: data.message ?? "",
          return_time: data.return_time ?? "",
        });
      }

      setLoading(false);
    };

    loadStatus();

    const channel = supabase
      .channel("global-store-status")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_status",
          filter: "id=eq.1",
        },
        (payload) => {
          const next = (payload.new ?? {}) as Partial<StoreStatus>;
          if (!mounted) return;
          setStatus({
            is_paused: !!next.is_paused,
            message: next.message ?? "",
            return_time: next.return_time ?? "",
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // CORREÇÃO: Se você for Admin, o bloqueio NUNCA aparece para você
  if (isAdmin) {
    return <Outlet />;
  }

  // Enquanto carrega o status do banco, espera um pouco
  if (loading) {
    return <div className="min-h-screen bg-black" />;
  }

  // Se estiver pausado e NÃO for admin, bloqueia a tela
  if (status.is_paused) {
    return <PauseScreen status={status} />;
  }

  return <Outlet />;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=0",
      },
      { name: "theme-color", content: "#1a1612" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Hengles" },
      { name: "application-name", content: "Hengles" },
      { title: "Hengles Barbearia — App de Agendamentos" },
      {
        name: "description",
        content:
          "Agende seu corte no app da Hengles Barbearia. Experiência premium, sem complicação.",
      },
      { name: "author", content: "Hengles" },
      { property: "og:title", content: "App Hengles Barbearia" },
      {
        property: "og:description",
        content: "Aplicativo de agendamentos premium para clientes exigentes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <PauseGate />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}