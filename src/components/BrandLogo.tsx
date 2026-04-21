import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandLogo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-gold shadow-gold">
        <Scissors className="h-4 w-4 text-primary-foreground" strokeWidth={2.4} />
      </span>
      {withText && (
        <span className="font-display text-xl font-semibold tracking-tight">
          Hengles
        </span>
      )}
    </div>
  );
}
