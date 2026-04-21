import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a0a] px-6 py-10">
      <div className="w-full max-w-md text-center rounded-3xl border border-white/5 bg-[#141414] p-8 shadow-2xl animate-in fade-in zoom-in duration-500">
        
        {/* Ícone de Erro Premium */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20 shadow-inner">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        
        {/* Textos */}
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">Ops! Algo deu errado</h1>
        <p className="mt-2 text-sm text-white/50 leading-relaxed">
          Ocorreu um erro inesperado no aplicativo. Por favor, tente novamente.
        </p>
        
        {/* Log de erro apenas em modo de desenvolvimento */}
        {import.meta.env.DEV && error.message && (
          <pre className="mt-6 max-h-40 overflow-auto rounded-xl bg-black/50 border border-white/10 p-4 text-left font-mono text-[10px] text-destructive scrollbar-hide">
            {error.message}
          </pre>
        )}
        
        {/* Botões de Ação */}
        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold px-4 text-sm font-bold text-[#1a1612] shadow-gold transition-transform active:scale-95"
          >
            <RefreshCcw className="h-5 w-5" />
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 text-sm font-bold text-white transition-colors hover:bg-white/5"
          >
            <Home className="h-5 w-5" />
            Voltar ao Início
          </a>
        </div>
        
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};