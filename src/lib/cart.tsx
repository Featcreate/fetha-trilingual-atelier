import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartLine = { productId: string };

type CartContextValue = {
  items: CartLine[];
  count: number;
  add: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "algorea-bazaar.cart.v1";
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const ids = parsed.flatMap((line): string[] => {
            const id = line && typeof line.productId === "string" ? line.productId : "";
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
              ? [id]
              : [];
          });
          // Migrate old quantity-based carts to one entitlement per distinct product.
          setItems([...new Set(ids)].slice(0, 50).map((productId) => ({ productId })));
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.length,
      add: (productId) =>
        setItems((current) =>
          current.some((line) => line.productId === productId) || current.length >= 50
            ? current
            : [...current, { productId }],
        ),
      remove: (productId) =>
        setItems((current) => current.filter((line) => line.productId !== productId)),
      clear: () => setItems([]),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
