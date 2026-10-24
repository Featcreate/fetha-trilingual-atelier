import { useState } from "react";

/**
 * ORIGINAL LOGO SLOT
 * Place the original FethaCreate logo file at: public/brand/fethacreate-logo.png
 * It is shown unmodified with object-contain. Until the file exists, a marked slot is shown.
 */
export const LOGO_SRC = "/brand/fethacreate-logo.png";

export function BrandLogo({ slotLabel, className = "" }: { slotLabel: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border-2 border-dashed border-gold px-3 text-xs font-semibold text-muted-foreground ${className}`}
        data-logo-slot="public/brand/fethacreate-logo.png"
      >
        {slotLabel}
      </div>
    );
  }
  return (
    <img
      src={LOGO_SRC}
      alt="FethaCreate"
      className={`object-contain ${className}`}
      onError={() => setMissing(true)}
    />
  );
}
