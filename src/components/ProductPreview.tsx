import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function ProductPreview({
  path,
  alt,
  className = "h-full w-full object-contain",
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!path || failedPath === path) {
    return <span className="text-3xl font-bold text-petrol/50">AB</span>;
  }

  const imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Agrandir l’image : ${alt}`}
        className="inline-flex h-full w-full cursor-zoom-in items-center justify-center border-0 bg-transparent p-0"
      >
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          className={className}
          onError={() => setFailedPath(path)}
        />
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            className="relative flex max-h-full max-w-full items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Fermer l’aperçu"
              className="absolute -right-2 -top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl font-bold text-petrol shadow-lg hover:bg-cream-light"
            >
              ×
            </button>
            <img
              src={imageUrl}
              alt={alt}
              className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
