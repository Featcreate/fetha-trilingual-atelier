import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function ProductPreview({ path, alt, className = "h-full w-full object-contain" }: { path: string | null; alt: string; className?: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  if (!path || failedPath === path) return <span className="text-3xl font-bold text-petrol/50">AB</span>;
  return <img src={supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl}
    alt={alt} loading="lazy" className={className} onError={() => setFailedPath(path)} />;
}