import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

type HeaderCartLinkProps = {
  lang: "ar" | "fr" | "en";
};

export function HeaderCartLink({ lang }: HeaderCartLinkProps) {
  const { count } = useCart();
  let label = "Shopping cart";

  if (lang === "ar") {
    label = "سلة المشتريات";
  } else if (lang === "fr") {
    label = "Panier";
  }

  return (
    <Link
      to="/cart"
      aria-label={label}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 p-2 text-red-600 transition-colors hover:bg-red-100"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
