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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo de 6 caracteres").max(128),
});

function LoginPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/app" });
  }, [authLoading, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Atalho do admin mantido
    const normalizedEmail =
      email.trim().toLowerCase() === "hengles@adm" ? "hengles@adm.local" : email.trim();

    const parsed = schema.safeParse({ email: normalizedEmail, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setSubmitting(false);

    if (error) {
      toast.error("Credenciais inválidas");
      return;
    }
    toast.success("Bem-vindo de volta à Hengles!");
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
        <h1 className="mt-8 font-display text-3xl font-bold tracking-tight">Bem-vindo de volta</h1>
        <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gold opacity-80">
          Entre para agendar seu próximo corte
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="space-y-1.5">
          <Label htmlFor="email" className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            E-mail
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="h-12 rounded-xl bg-[#141414] border border-white/5 text-white placeholder:text-white/20 focus:border-gold/50 focus:bg-[#1a1a1a] transition-colors"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="pl-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            Senha
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12 rounded-xl bg-[#141414] border border-white/5 text-white placeholder:text-white/20 focus:border-gold/50 focus:bg-[#1a1a1a] transition-colors pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/80 transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="mt-4 h-12 w-full rounded-xl bg-gradient-gold text-[#1a1612] font-bold shadow-gold transition-transform active:scale-95"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
        </Button>
      </form>

      <p className="mt-auto pt-8 text-center text-sm text-white/50">
        Não tem uma conta?{" "}
        <Link to="/cadastro" className="font-bold text-gold hover:text-gold/80 transition-colors">
          Cadastre-se
        </Link>
      </p>
    </main>
  );
}