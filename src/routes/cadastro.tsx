import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils"; // <-- Aqui estava o erro!

export const Route = createFileRoute("/cadastro")({
  component: SignupPage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Informe seu nome completo").max(100),
  phone: z
    .string()
    .trim()
    .min(8, "Telefone inválido")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Telefone inválido"),
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo de 6 caracteres").max(128),
});

function SignupPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/app" });
  }, [authLoading, session, navigate]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: {
          full_name: parsed.data.full_name,
          phone: parsed.data.phone,
        },
      },
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message.includes("already")
        ? "Este email já está cadastrado"
        : "Não foi possível cadastrar");
      return;
    }
    
    toast.success("Conta criada! Bem-vindo à Hengles.");
    navigate({ to: "/app" });
  };

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pt-8 pb-10 bg-[#0a0a0a] text-white">
      <Link 
        to="/" 
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      
      <div className="mt-8 flex flex-col items-center text-center animate-in fade-in zoom-in duration-500">
        <BrandLogo />
        <h1 className="mt-8 font-display text-3xl font-bold tracking-tight">Criar conta</h1>
        <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gold opacity-80">Leva menos de 1 minuto</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Field id="full_name" label="Nome completo" value={form.full_name} onChange={set("full_name")} autoComplete="name" />
        <Field id="phone" label="Telefone / WhatsApp" value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" />
        <Field id="email" label="E-mail" value={form.email} onChange={set("email")} type="email" inputMode="email" autoComplete="email" />
        <Field id="password" label="Senha" value={form.password} onChange={set("password")} type="password" autoComplete="new-password" />

        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="mt-4 h-12 w-full rounded-xl bg-gradient-gold text-[#1a1612] font-bold shadow-gold transition-transform active:scale-95"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar minha conta"}
        </Button>
      </form>

      <p className="mt-auto pt-8 text-center text-sm text-white/50">
        Já possui uma conta?{" "}
        <Link to="/login" className="font-bold text-gold hover:text-gold/80 transition-colors">
          Entrar agora
        </Link>
      </p>
    </main>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const isPassword = props.type === "password";
  const inputType = isPassword ? (showPwd ? "text" : "password") : (props.type ?? "text");

  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id} className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
        {props.label}
      </Label>
      <div className="relative">
        <Input
          id={props.id}
          type={inputType}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={props.onChange}
          className={cn(
            "h-12 rounded-xl bg-[#141414] border border-white/5 text-white placeholder:text-white/20 focus:border-gold/50 focus:bg-[#1a1a1a] transition-colors",
            isPassword ? "pr-12" : "" 
          )}
          required
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/80 transition-colors"
            tabIndex={-1} 
          >
            {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}