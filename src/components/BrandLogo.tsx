/** Official Algorea Bazaar logo, shown unmodified with object-contain. */
export const LOGO_SRC = "/brand/algorea-bazaar-logo.jpg";

export function BrandLogo({ className = "" }: { slotLabel?: string; className?: string }) {
  return <img src={LOGO_SRC} alt="Algorea Bazaar" className={`object-contain ${className}`} />;
}
