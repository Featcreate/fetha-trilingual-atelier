import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ProductPreviewProps = {
  path: string | null;
  alt: string;
  className?: string;
};

export function ProductPreview({
  path,
  alt,
  className = "h-full w-full object-contain",
}: ProductPreviewProps) {
  const [failedPath, setFailedPath] = useState<string | null>(null);

  if (!path || failedPath === path) {
    return (
      <span
        role="img"
        aria-label={alt}
        className="flex h-full w-full items-center justify-center text-3xl font-bold text-petrol/50"
      >
        AB
      </span>
    );
  }

  const imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;

  return (
    <img
      src={imageUrl}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailedPath(path)}
    />
  );
}
