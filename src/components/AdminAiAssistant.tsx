import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, Bot, User as UserIcon, ChevronRight, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const SUGGESTIONS = [
  "📱 Crie um post de Instagram para promoção de Corte + Barba.",
  "💬 Texto curto de WhatsApp para lembrar o cliente do horário.",
  "💡 Sugira 3 ideias de combos para aumentar o ticket médio.",
  "🔥 Como atrair clientes novos para a barbearia essa semana?",
];

export function AdminAiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    
    const userMsg: Msg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    
    setMessages(next);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      // Cérebro focado em Marketing e Gestão, sem forçar leitura de dados
      const systemPrompt: Msg = {
        role: "system",
        content: `Você é a Hengles IA, especialista em marketing, vendas e gestão para a Barbearia Hengles. 
        Sua missão é ajudar o dono a criar textos persuasivos para WhatsApp, legendas para Instagram, ideias de promoções e estratégias para atrair clientes.
        Seja sempre direto, criativo e use um tom premium e parceiro.`
      };

      const payloadMessages = [systemPrompt, ...next];

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: payloadMessages }),
      });

      if (resp.status === 429) {
        toast.error("Aguarde alguns segundos e tente de novo.");
        setLoading(false); return;
      }
      if (resp.status === 402) {
        toast.error("Créditos da IA esgotados.");
        setLoading(false); return;
      }
      if (!resp.ok || !resp.body) throw new Error("Falha ao iniciar resposta");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) upsert(delta);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro de conexão com a Hengles IA.");
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (confirm("Apagar histórico de conversa com a IA?")) {
      setMessages([]);
      toast.success("Memória limpa!");
    }
  };

  return (
    <>
      {/* BOTÃO FLUTUANTE PREMIUM */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black shadow-[0_0_30px_rgba(212,175,55,0.5)] hover:scale-110 hover:shadow-[0_0_40px_rgba(212,175,55,0.7)] active:scale-95 transition-all sm:bottom-10 sm:right-10"
        aria-label="Abrir assistente IA"
      >
        <Sparkles className="h-7 w-7" />
      </button>

      {/* MODAL DA IA */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-6 animate-in fade-in duration-300">
          <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2.5rem] border border-white/10 bg-[#0a0a0a] shadow-2xl sm:h-[85vh] sm:rounded-[2.5rem] animate-in slide-in-from-bottom-10">
            
            {/* HEADER */}
            <header className="flex items-center justify-between border-b border-white/5 bg-[#121212] px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 text-gold border border-gold/30 shadow-inner">
                  <Bot className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-lg font-black text-white tracking-tight leading-none">Hengles IA</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Online</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/40 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    title="Apagar conversa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* ÁREA DE MENSAGENS */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 scrollbar-hide relative sm:px-10 sm:py-8">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-6 text-center mt-4">
                  <div className="relative">
                    <div className="absolute -inset-6 bg-gold/20 blur-3xl rounded-full opacity-60" />
                    <span className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-white/10 text-gold shadow-2xl">
                      <Sparkles className="h-12 w-12" />
                    </span>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white tracking-tight">Estratégia e Marketing</p>
                    <p className="mt-2 text-sm font-medium text-white/40 max-w-[320px] mx-auto leading-relaxed">
                      Como posso te ajudar a bombar a barbearia hoje? Escolha uma opção ou mande sua dúvida.
                    </p>
                  </div>
                  <ul className="mt-6 flex w-full max-w-lg flex-col gap-3">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button
                          onClick={() => send(s)}
                          className="w-full rounded-2xl border border-white/5 bg-[#121212] px-5 py-4 text-left text-[13px] font-bold text-white/70 hover:border-gold/50 hover:text-gold hover:bg-[#161616] transition-all shadow-sm flex items-center justify-between group"
                        >
                          {s}
                          <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-gold transition-colors" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ul className="flex flex-col gap-6">
                  {messages.map((m, i) => (
                    <li key={i} className={cn("flex items-end gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                      <span className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm",
                        m.role === "user" ? "bg-gold/10 text-gold border-gold/20" : "bg-[#161616] text-white/80 border-white/10"
                      )}>
                        {m.role === "user" ? <UserIcon className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                      </span>
                      <div className={cn(
                        "max-w-[90%] sm:max-w-[80%] rounded-[1.8rem] px-6 py-4 text-[14px] sm:text-[15px] font-medium shadow-md",
                        m.role === "user"
                          ? "rounded-br-sm bg-gradient-to-br from-gold to-yellow-600 text-black font-bold"
                          : "rounded-bl-sm border border-white/5 bg-[#121212] text-white/90 leading-relaxed"
                      )}>
                        {m.role === "assistant" ? (
                          <div className="prose prose-sm sm:prose-base prose-invert max-w-none 
                            [&_strong]:text-white [&_strong]:font-black
                            [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1"
                          >
                            <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                    </li>
                  ))}
                  
                  {loading && messages[messages.length - 1]?.role === "user" && (
                    <li className="flex items-end gap-3 animate-in fade-in">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#161616] border border-white/5 text-white/60">
                        <Bot className="h-5 w-5" />
                      </span>
                      <div className="rounded-[1.8rem] rounded-bl-sm border border-white/5 bg-[#121212] px-6 py-4 shadow-md flex items-center gap-3 h-14">
                        <p className="text-[11px] font-black uppercase tracking-widest text-gold">Hengles IA digitando</p>
                        <div className="flex gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-bounce" />
                          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-bounce delay-100" />
                          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-bounce delay-200" />
                        </div>
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* INPUT DE MENSAGEM */}
            <div className="border-t border-white/5 bg-[#0a0a0a] p-4 pb-8 sm:p-6 sm:bg-[#121212]/50">
              <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-3 bg-[#161616] p-1.5 rounded-full border border-white/10 focus-within:border-gold/50 focus-within:shadow-[0_0_15px_rgba(212,175,55,0.1)] transition-all max-w-4xl mx-auto">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Peça textos para Instagram, ideias de promoções..."
                  className="flex-1 bg-transparent px-5 py-3.5 text-[15px] font-bold text-white outline-none placeholder:text-white/30"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold to-yellow-600 text-black shadow-gold disabled:opacity-50 disabled:bg-white/5 disabled:text-white/20 transition-all active:scale-90"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-1" />}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}