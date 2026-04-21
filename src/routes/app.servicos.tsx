import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatPrice, formatDuration } from "@/lib/format";
import { Plus, Pencil, Loader2, Trash2, Camera, Scissors, Clock } from "lucide-react";

export const Route = createFileRoute("/app/servicos")({
  component: ServicesAdminPage,
});

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  image_url: string | null;
  is_active: boolean;
}

function ServicesAdminPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [open, setOpen] = useState<Service | "new" | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app" });
  }, [isAdmin, loading, navigate]);

  const load = () => {
    supabase
      .from("services")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setServices(data ?? []));
  };

  useEffect(load, []);

  const remove = async (id: string) => {
    if (!confirm("Excluir este serviço?")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      toast.error("Erro: pode haver agendamentos vinculados.");
      return;
    }
    toast.success("Serviço excluído");
    load();
  };

  return (
    <div className="px-5 pt-6 pb-24">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Serviços</h1>
          <p className="text-sm text-muted-foreground">Gerencie sua oferta</p>
        </div>
        <Button size="sm" onClick={() => setOpen("new")} className="bg-gradient-gold text-primary-foreground">
          <Plus className="mr-1 h-4 w-4" /> Novo
        </Button>
      </header>

      <ul className="mt-5 flex flex-col gap-3">
        {services.map((s) => (
          <li key={s.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-elegant">
            <div className="flex p-3 gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted/50 border border-border">
                {s.image_url ? (
                  <img src={s.image_url} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Scissors className="h-6 w-6" />
                  </div>
                )}
              </div>
              
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-bold text-foreground">{s.name}</p>
                  {!s.is_active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase font-semibold text-muted-foreground">
                      Inativo
                    </span>
                  )}
                </div>
                
                {/* DESCRIÇÃO ADICIONADA AQUI TAMBÉM */}
                {s.description && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>
                )}

                <div className="mt-auto pt-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatDuration(s.duration_minutes)}
                  </p>
                  <p className="text-sm font-bold text-primary">{formatPrice(s.price_cents)}</p>
                </div>
              </div>

              <div className="flex flex-col justify-between border-l border-border pl-2 ml-1">
                <button
                  onClick={() => setOpen(s)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
        {services.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum serviço ainda. Crie o primeiro!
          </li>
        )}
      </ul>

      {open && (
        <ServiceDialog
          service={open === "new" ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ServiceDialog({
  service,
  onClose,
  onSaved,
}: {
  service: Service | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [duration, setDuration] = useState(service?.duration_minutes ?? 30);
  const [price, setPrice] = useState(service ? service.price_cents / 100 : 0);
  const [imageUrl, setImageUrl] = useState(service?.image_url ?? "");
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("services").upload(path, file, { upsert: true });
    if (error) {
      setUploading(false);
      toast.error("Erro ao enviar imagem");
      return;
    }
    const { data } = supabase.storage.from("services").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploading(false);
  };

  const save = async () => {
    if (!name.trim() || duration <= 0 || price < 0) {
      toast.error("Preencha nome, duração e valor");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      duration_minutes: Math.round(duration),
      price_cents: Math.round(price * 100),
      image_url: imageUrl || null,
      is_active: isActive,
    };
    const { error } = service
      ? await supabase.from("services").update(payload).eq("id", service.id)
      : await supabase.from("services").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar");
      return;
    }
    toast.success(service ? "Serviço atualizado" : "Serviço criado");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-4 bg-muted/30 border-b border-border">
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
          <div className="flex items-center gap-4 pb-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6" />
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Imagem do Serviço</span>
              <span className="text-xs text-muted-foreground mt-0.5">Toque no quadrado para fazer upload da foto.</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome do Serviço</Label>
            <Input placeholder="Ex: Corte Degrade" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          
          <div className="space-y-1.5">
            <Label>Descrição (Opcional)</Label>
            <Textarea placeholder="Descreva o que está incluso neste serviço..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={300} className="resize-none" />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duração (min)</Label>
              <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" min={0} step={0.5} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </div>
          </div>
          
          <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-card mt-2">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Status do Serviço</span>
              <span className="text-xs text-muted-foreground">Serviços inativos não aparecem para os clientes.</span>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter className="p-5 pt-4 border-t border-border bg-muted/10 gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto bg-gradient-gold text-primary-foreground shadow-md">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Serviço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}