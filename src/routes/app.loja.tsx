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
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { formatPrice } from "@/lib/format";
import {
  Camera,
  Loader2,
  Plus,
  ShoppingBag,
  Trash2,
  Pencil,
  MessageCircle,
  Package,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/loja")({
  component: ShopPage,
});

interface Product {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_active: boolean;
  stock_quantity: number;
}

function ShopPage() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const load = () => {
    const q = supabase.from("products").select("*").order("created_at", { ascending: false });
    (isAdmin ? q : q.eq("is_active", true)).then(({ data }) =>
      setProducts((data as Product[]) ?? [])
    );
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("products-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const totalStock = products.reduce((s, p) => s + (p.stock_quantity || 0), 0);
  const outOfStock = products.filter((p) => p.stock_quantity === 0).length;

  return (
    <div className="px-5 pt-6">
      <AppHeader title="Loja" subtitle={isAdmin ? "Gerencie a vitrine" : "Produtos da Hangles"} />

      {isAdmin && (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <StockKpi label="Produtos" value={String(products.length)} />
            <StockKpi label="Estoque" value={String(totalStock)} />
            <StockKpi label="Esgotados" value={String(outOfStock)} highlight={outOfStock > 0} />
          </div>
          <Button
            onClick={() => setEditing("new")}
            className="mt-3 w-full bg-gradient-gold text-primary-foreground shadow-gold"
          >
            <Plus className="mr-1 h-4 w-4" /> Novo produto
          </Button>
        </>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {products.length === 0 ? (
          <div className="col-span-2 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <ShoppingBag className="mx-auto mb-2 h-6 w-6" />
            {isAdmin ? "Adicione produtos à vitrine." : "Em breve novos produtos."}
          </div>
        ) : (
          products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isAdmin={isAdmin}
              onEdit={() => setEditing(p)}
              onChanged={load}
            />
          ))
        )}
      </div>

      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function StockKpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-2.5 text-center shadow-elegant",
        highlight ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"
      )}
    >
      <p className="font-display text-lg leading-none">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function ProductCard({
  product,
  isAdmin,
  onEdit,
  onChanged,
}: {
  product: Product;
  isAdmin: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const outOfStock = product.stock_quantity <= 0;

  const handleAcquire = () => {
    const draft = `Olá! Tenho interesse no produto: ${product.name} (${formatPrice(product.price_cents)}). Pode me passar mais informações?`;
    navigate({ to: "/app/chat", search: { draft } });
  };

  const adjustStock = async (delta: number) => {
    const next = Math.max(0, product.stock_quantity + delta);
    const { error } = await supabase
      .from("products")
      .update({ stock_quantity: next })
      .eq("id", product.id);
    if (error) return toast.error("Erro ao atualizar estoque");
    onChanged();
  };

  const remove = async () => {
    if (!confirm("Remover produto?")) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) return toast.error("Erro ao remover");
    toast.success("Produto removido");
    onChanged();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elegant">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className={cn("h-full w-full object-cover", outOfStock && "opacity-50")}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="h-6 w-6" />
          </div>
        )}
        {outOfStock && (
          <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive-foreground">
            Esgotado
          </span>
        )}
        {!outOfStock && product.stock_quantity <= 3 && (
          <span className="absolute left-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
            Últimas {product.stock_quantity}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{product.name}</p>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{product.description}</p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm font-semibold text-primary">{formatPrice(product.price_cents)}</p>
          {!isAdmin && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Package className="h-3 w-3" />
              {product.stock_quantity}
            </span>
          )}
        </div>

        {isAdmin ? (
          <>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-muted px-1 py-1">
              <button
                onClick={() => adjustStock(-1)}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-background"
                aria-label="Diminuir estoque"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-xs font-semibold">{product.stock_quantity} un</span>
              <button
                onClick={() => adjustStock(1)}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-background"
                aria-label="Aumentar estoque"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="outline" onClick={onEdit} className="flex-1">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={remove} className="text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </>
        ) : (
          <Button
            onClick={handleAcquire}
            size="sm"
            disabled={outOfStock}
            className="mt-2 w-full bg-gradient-gold text-primary-foreground disabled:opacity-50"
          >
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
            {outOfStock ? "Esgotado" : "Adquirir"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? (product.price_cents / 100).toFixed(2) : "");
  const [stock, setStock] = useState(String(product?.stock_quantity ?? 0));
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem muito grande (máx 5MB)");
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("products").upload(path, file, { upsert: false });
    setUploading(false);
    if (error) return toast.error("Erro ao enviar foto");
    const { data } = supabase.storage.from("products").getPublicUrl(path);
    setImageUrl(data.publicUrl);
  };

  const save = async () => {
    if (!name.trim() || !price) return toast.error("Preencha nome e preço");
    const cents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return toast.error("Preço inválido");
    const stockNum = Math.max(0, Math.floor(Number(stock) || 0));
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price_cents: cents,
      stock_quantity: stockNum,
      image_url: imageUrl || null,
      is_active: isActive,
    };
    const { error } = product
      ? await supabase.from("products").update(payload).eq("id", product.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return toast.error("Erro ao salvar");
    toast.success("Produto salvo");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative h-28 w-28 overflow-hidden rounded-2xl border border-dashed border-border bg-muted"
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
          </div>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Package className="h-3 w-3" /> Estoque
              </Label>
              <Input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Visível na vitrine
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-gold text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
