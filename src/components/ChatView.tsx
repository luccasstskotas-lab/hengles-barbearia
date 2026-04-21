import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Image as ImageIcon,
  Loader2,
  Mic,
  Send,
  Video as VideoIcon,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: "text" | "image" | "audio" | "video";
  content: string | null;
  media_url: string | null;
  media_duration_seconds: number | null;
  status: "sent" | "delivered" | "read";
  read_at: string | null;
  created_at: string;
  // optimistic-only
  _local?: "sending" | "uploading" | "error";
  _uploadProgress?: number;
}

interface PartnerProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
}

interface Props {
  conversationId: string;
  partner: PartnerProfile;
  onBack?: () => void;
  initialDraft?: string;
}

function tempId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatView({ conversationId, partner, onBack, initialDraft }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState(initialDraft ?? "");
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [partnerLive, setPartnerLive] = useState<PartnerProfile>(partner);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = (smooth = true) => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }, 30);
  };

  // Load + subscribe (filtered by conversation)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages((data as Message[]) ?? []);
        scrollToBottom(false);
      });

    supabase.rpc("mark_conversation_read" as never, { _conversation_id: conversationId } as never);

    const ch = supabase
      .channel(`chat-${conversationId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => {
            // Replace optimistic temp by real message from same sender within recent window
            const idx = cur.findIndex(
              (x) =>
                x._local &&
                x.sender_id === m.sender_id &&
                x.type === m.type &&
                ((x.content ?? "") === (m.content ?? "")) &&
                Math.abs(new Date(x.created_at).getTime() - new Date(m.created_at).getTime()) < 60_000
            );
            if (idx >= 0) {
              const next = [...cur];
              next[idx] = m;
              return next;
            }
            if (cur.some((x) => x.id === m.id)) return cur;
            return [...cur, m];
          });
          if (m.sender_id !== user.id) {
            supabase.rpc("mark_conversation_read" as never, { _conversation_id: conversationId } as never);
          }
          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "typing_indicators", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { user_id: string };
          if (!row || row.user_id === user.id) return;
          if (payload.eventType === "DELETE") {
            setPartnerTyping(false);
          } else {
            setPartnerTyping(true);
            setTimeout(() => setPartnerTyping(false), 4000);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${partner.id}` },
        (payload) => {
          setPartnerLive((cur) => ({ ...cur, ...(payload.new as PartnerProfile) }));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [conversationId, user, partner.id]);

  const sendTyping = () => {
    if (!user) return;
    supabase
      .from("typing_indicators")
      .upsert({ conversation_id: conversationId, user_id: user.id, updated_at: new Date().toISOString() })
      .then(() => undefined);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      supabase
        .from("typing_indicators")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
    }, 2500);
  };

  // ============ OPTIMISTIC TEXT ============
  const sendText = async () => {
    if (!user) return;
    const value = text.trim();
    if (!value) return;
    setText("");

    const id = tempId();
    const optimistic: Message = {
      id,
      conversation_id: conversationId,
      sender_id: user.id,
      type: "text",
      content: value,
      media_url: null,
      media_duration_seconds: null,
      status: "sent",
      read_at: null,
      created_at: new Date().toISOString(),
      _local: "sending",
    };
    setMessages((cur) => [...cur, optimistic]);
    scrollToBottom();

    const { error, data } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        type: "text",
        content: value,
      } as never)
      .select()
      .single();

    if (error) {
      setMessages((cur) => cur.map((x) => (x.id === id ? { ...x, _local: "error" } : x)));
      toast.error("Erro ao enviar mensagem");
      return;
    }
    if (data) {
      const real = data as unknown as Message;
      setMessages((cur) => cur.map((x) => (x.id === id ? real : x)));
    }
  };

  // ============ OPTIMISTIC MEDIA ============
  const uploadMedia = async (file: File, type: "image" | "audio" | "video", durationSec?: number) => {
    if (!user) return;
    const id = tempId();
    const localUrl = URL.createObjectURL(file);
    const optimistic: Message = {
      id,
      conversation_id: conversationId,
      sender_id: user.id,
      type,
      content: null,
      media_url: localUrl,
      media_duration_seconds: durationSec ?? null,
      status: "sent",
      read_at: null,
      created_at: new Date().toISOString(),
      _local: "uploading",
      _uploadProgress: 0,
    };
    setMessages((cur) => [...cur, optimistic]);
    scrollToBottom();

    // Simulated progress (Supabase JS doesn't expose true progress yet)
    const progressTimer = setInterval(() => {
      setMessages((cur) =>
        cur.map((x) =>
          x.id === id && (x._uploadProgress ?? 0) < 90
            ? { ...x, _uploadProgress: Math.min(90, (x._uploadProgress ?? 0) + 10) }
            : x
        )
      );
    }, 250);

    const ext = file.name.split(".").pop() || (type === "audio" ? "webm" : "bin");
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("chat-media")
      .upload(path, file, { contentType: file.type });

    clearInterval(progressTimer);

    if (upErr) {
      setMessages((cur) => cur.map((x) => (x.id === id ? { ...x, _local: "error" } : x)));
      toast.error("Erro ao enviar arquivo");
      return;
    }

    setMessages((cur) => cur.map((x) => (x.id === id ? { ...x, _uploadProgress: 95 } : x)));

    const { data: signed } = await supabase.storage
      .from("chat-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl;
    if (!url) {
      setMessages((cur) => cur.map((x) => (x.id === id ? { ...x, _local: "error" } : x)));
      toast.error("Erro gerando URL");
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        type,
        media_url: url,
        media_duration_seconds: durationSec ?? null,
      } as never)
      .select()
      .single();

    if (error) {
      setMessages((cur) => cur.map((x) => (x.id === id ? { ...x, _local: "error" } : x)));
      toast.error("Erro ao registrar mensagem");
      return;
    }
    if (data) {
      const real = data as unknown as Message;
      setMessages((cur) => cur.map((x) => (x.id === id ? real : x)));
      URL.revokeObjectURL(localUrl);
    }
  };

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Imagem grande demais (máx 10MB)");
    await uploadMedia(file, "image");
  };
  const onPickVideo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) return toast.error("Vídeo grande demais (máx 30MB)");
    await uploadMedia(file, "video");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recordStartRef.current = Date.now();
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const dur = Math.round((Date.now() - recordStartRef.current) / 1000);
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
        await uploadMedia(file, "audio", dur);
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const cancelRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  };

  // Group by date
  const grouped: { date: string; items: Message[] }[] = [];
  messages.forEach((m) => {
    const date = m.created_at.slice(0, 10);
    if (!grouped.length || grouped[grouped.length - 1].date !== date) {
      grouped.push({ date, items: [m] });
    } else {
      grouped[grouped.length - 1].items.push(m);
    }
  });

  const lastSeen = partnerLive.is_online
    ? "online agora"
    : partnerLive.last_seen_at
    ? `visto ${formatDistanceToNow(parseISO(partnerLive.last_seen_at), { addSuffix: true, locale: ptBR })}`
    : "offline";

  return (
    <div className="flex h-[100dvh] flex-col bg-[oklch(0.12_0.01_60)]">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-card/95 px-3 py-2.5 backdrop-blur-xl">
        {onBack && (
          <button
            onClick={onBack}
            className="tap-scale flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold uppercase">
            {partnerLive.avatar_url ? (
              <img src={partnerLive.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              partnerLive.full_name.slice(0, 1)
            )}
          </div>
          {partnerLive.is_online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{partnerLive.full_name}</p>
          <p className={cn("truncate text-[11px]", partnerTyping ? "text-primary" : "text-muted-foreground")}>
            {partnerTyping ? "digitando…" : lastSeen}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 10%, oklch(0.78 0.13 80 / 0.04), transparent 60%), radial-gradient(circle at 80% 80%, oklch(0.78 0.13 80 / 0.03), transparent 60%)",
        }}
      >
        {grouped.map((g) => (
          <div key={g.date}>
            <div className="my-3 flex justify-center">
              <span className="rounded-full bg-card/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {format(parseISO(g.date), "d 'de' MMM", { locale: ptBR })}
              </span>
            </div>
            {g.items.map((m, i) => {
              const prev = g.items[i - 1];
              const tail = !prev || prev.sender_id !== m.sender_id;
              return <Bubble key={m.id} message={m} mine={m.sender_id === user?.id} tail={tail} />;
            })}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              💬
            </div>
            <p className="text-sm font-medium">Comece a conversa</p>
            <p className="text-xs text-muted-foreground">Envie a primeira mensagem para {partnerLive.full_name.split(" ")[0]}.</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/60 bg-card/95 px-2 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-xl">
        {recording ? (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelRecording}
              className="tap-scale flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-1 items-center justify-center gap-2 rounded-full bg-destructive/10 py-2.5 text-sm text-destructive">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
              Gravando…
            </div>
            <button
              onClick={stopRecording}
              className="tap-scale flex h-11 w-11 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-1.5">
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={onPickVideo} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="tap-scale flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Enviar foto"
            >
              <ImageIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              className="tap-scale flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Enviar vídeo"
            >
              <VideoIcon className="h-5 w-5" />
            </button>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                sendTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText();
                }
              }}
              placeholder="Mensagem"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-border bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              style={{ maxHeight: 120 }}
            />
            {text.trim() ? (
              <button
                onClick={sendText}
                className="tap-scale flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold"
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="tap-scale flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold"
                aria-label="Gravar áudio"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ message, mine, tail }: { message: Message; mine: boolean; tail: boolean }) {
  const isUploading = message._local === "uploading";
  const isSending = message._local === "sending";
  const hasError = message._local === "error";

  return (
    <div className={cn("mb-1 flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[82%] px-3 py-2 text-sm shadow-sm transition-all sm:max-w-[70%]",
          mine
            ? "rounded-2xl bg-gradient-to-br from-[oklch(0.78_0.13_80)] to-[oklch(0.68_0.14_70)] text-[oklch(0.18_0.02_60)]"
            : "rounded-2xl border border-border/60 bg-card text-card-foreground",
          mine && tail && "rounded-br-md",
          !mine && tail && "rounded-bl-md",
          hasError && "ring-2 ring-destructive/60"
        )}
      >
        {message.type === "text" && (
          <p className="whitespace-pre-wrap break-words leading-snug">{message.content}</p>
        )}
        {message.type === "image" && message.media_url && (
          <div className="relative">
            <a href={message.media_url} target="_blank" rel="noopener noreferrer">
              <img
                src={message.media_url}
                alt=""
                className={cn("max-h-72 rounded-xl", isUploading && "opacity-60")}
              />
            </a>
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow" />
              </div>
            )}
          </div>
        )}
        {message.type === "audio" && message.media_url && (
          <audio controls src={message.media_url} className="max-w-full" />
        )}
        {message.type === "video" && message.media_url && (
          <div className="relative">
            <video
              controls
              src={message.media_url}
              className={cn("max-h-72 max-w-full rounded-xl", isUploading && "opacity-60")}
            />
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow" />
              </div>
            )}
          </div>
        )}

        {isUploading && (
          <div className="mt-1.5">
            <Progress value={message._uploadProgress ?? 0} className="h-1" />
          </div>
        )}

        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
            mine ? "text-[oklch(0.18_0.02_60)]/70" : "text-muted-foreground"
          )}
        >
          <span>{format(parseISO(message.created_at), "HH:mm")}</span>
          {mine && !hasError && !isSending && !isUploading && <ReadTicks status={message.status} />}
          {mine && (isSending || isUploading) && <Loader2 className="h-3 w-3 animate-spin" />}
          {mine && hasError && <AlertCircle className="h-3 w-3 text-destructive" />}
        </div>
      </div>
    </div>
  );
}

function ReadTicks({ status }: { status: Message["status"] }) {
  if (status === "read") return <CheckCheck className="h-3 w-3" style={{ color: "oklch(0.55 0.18 230)" }} />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" />;
  return <Check className="h-3 w-3" />;
}
