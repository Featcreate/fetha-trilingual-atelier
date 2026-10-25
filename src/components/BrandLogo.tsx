import logoAsset from "@/assets/algorea-bazaar-logo.png.asset.json";

/** Official Algorea Bazaar logo, shown unmodified with object-contain. */
export const LOGO_SRC = logoAsset.url;

export function BrandLogo({ className = "" }: { slotLabel?: string; className?: string }) {
  return <img src={LOGO_SRC} alt="Algorea Bazaar" className={`object-contain ${className}`} />;
}
