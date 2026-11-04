import { useState } from "react";

/** Official Algorea Bazaar logo, shown unmodified with object-contain. */
export const LOGO_SRC = "/brand/algorea-bazaar-logo.png";

export function BrandLogo({ className = "" }: { slotLabel?: string; className?: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return (
      <span
        role="img"
        aria-label="Algorea Bazaar"
        className={`flex items-center justify-center text-center font-bold leading-tight text-petrol ${className}`}
      >
        Algorea Bazaar
      </span>
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt="Algorea Bazaar"
      className={`object-contain ${className}`}
      onError={() => setImageFailed(true)}
    />
  );
}
