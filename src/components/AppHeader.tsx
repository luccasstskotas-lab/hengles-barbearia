import { BrandLogo } from "@/components/BrandLogo";
import { NotificationBell } from "@/components/NotificationBell";

interface Props {
  title?: string;
  subtitle?: string;
}

export function AppHeader({ title, subtitle }: Props) {
  return (
    <header className="flex items-center justify-between">
      <div>
        {title ? (
          <>
            <h1 className="font-display text-2xl">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </>
        ) : (
          <BrandLogo />
        )}
      </div>
      <NotificationBell />
    </header>
  );
}
