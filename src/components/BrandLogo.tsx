import { useEffect, useState } from "react";

/**
 * ORIGINAL LOGO SLOT
 * Place the original FethaCreate logo file at: public/brand/fethacreate-logo.png
 * It is shown unmodified with object-contain. Until the file exists, a marked slot is shown.
 */
export const LOGO_SRC = "/brand/fethacreate-logo.png";

export function BrandLogo({ slotLabel, className = "" }: { slotLabel: string; className?: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setAvailable(true);
    img.onerror = () => setAvailable(false);
    img.src = LOGO_SRC;
  }, []);

  if (available) {
    return <img src={LOGO_SRC} alt="FethaCreate" className={`object-contain ${className}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center rounded-md border-2 border-dashed border-gold px-2 text-center text-[10px] font-semibold leading-tight text-muted-foreground ${className}`}
      data-logo-slot="public/brand/fethacreate-logo.png"
      aria-label="FethaCreate"
    >
      {available === false ? slotLabel : ""}
    </div>
  );
}
