import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Marca o usuário como online com heartbeat a cada 25s. */
export function usePresence() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let active = true;
    const beat = () => {
      if (!active) return;
      supabase.rpc("heartbeat" as never).then(() => undefined);
    };
    beat();
    const id = setInterval(beat, 25000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
      else supabase.rpc("set_offline" as never).then(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", () => {
      supabase.rpc("set_offline" as never);
    });
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      supabase.rpc("set_offline" as never).then(() => undefined);
    };
  }, [user]);
}
