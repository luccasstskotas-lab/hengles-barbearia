import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/contexts/AuthContext";
import heroImage from "@/assets/hero-barber.jpg";
import { Calendar, Star, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && session) {
      navigate({ to: "/app" });
    }
  }, [authLoading, session, navigate]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* HERO */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `url(${heroImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-5">
          <BrandLogo />
          <Link to="/login">
            <Button
              variant="ghost"
              className="rounded-xl text-white hover:bg-white/10"
            >
              Entrar
            </Button>
          </Link>
        </header>

        <section className="mx-auto flex max-w-2xl flex-1 flex-col justify-center px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 self-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]">
            <Sparkles className="h-3 w-3" />
            Hengles Barbearia
          </div>

          <h1 className="mb-4 text-4xl font-bold leading-tight md:text-6xl">
            Seu próximo corte é uma experiência.
          </h1>
          <p className="mb-10 text-lg text-white/60">
            Agende em segundos. Estilo, tradição e atendimento de primeira.
          </p>

          <div className="mb-10 grid grid-cols-3 gap-3">
            <FeatureCard icon={Calendar} title="Rápido" subtitle="Em 30s" />
            <FeatureCard icon={Star} title="Premium" subtitle="5.0 ★" />
            <FeatureCard icon={Sparkles} title="Estilo" subtitle="Único" />
          </div>

          <Link to="/login" className="self-center">
            <Button className="h-14 gap-2 rounded-2xl bg-[#D4AF37] px-8 text-lg font-bold text-black hover:bg-[#c5a02f]">
              Criar minha conta <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({ icon: Icon, title, subtitle }: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <Icon className="mx-auto mb-2 h-5 w-5 text-[#D4AF37]" />
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="text-xs text-white/50">{subtitle}</p>
    </div>
  );
}
