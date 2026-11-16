import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartLine = { storeId: string; productId: string };

type CartContextValue = {
  items: CartLine[];
  count: number;
  storeCounts: Record<string, number>;
  add: (storeId: string, productId: string) => void;
  assignStore: (productId: string, storeId: string) => void;
  remove: (productId: string) => void;
  clear: (storeId?: string) => void;
};

const STORAGE_KEY = "algorea-bazaar.cart.v2";
const LEGACY_STORAGE_KEY = "algorea-bazaar.cart.v1";
const CartContext = createContext<CartContextValue | null>(null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const byProduct = new Map<string, CartLine>();
  for (const value of raw) {
    if (!value || typeof value.productId !== "string" || !UUID.test(value.productId)) continue;
    const storeId = typeof value.storeId === "string" && UUID.test(value.storeId) ? value.storeId : "";
    byProduct.set(value.productId, { productId: value.productId, storeId });
  }
  return [...byProduct.values()].slice(0, 500);
}

export function addCartProduct(current: CartLine[], storeId: string, productId: string): CartLine[] {
  if (!UUID.test(storeId) || !UUID.test(productId)) return current;
  if (current.some((line) => line.productId === productId)) return current;
  const storeCount = current.filter((line) => line.storeId === storeId).length;
  if (storeCount >= 50) return current;
  return [...current, { storeId, productId }];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      const parsed: unknown = current ? JSON.parse(current) : legacy ? JSON.parse(legacy) : [];
      setItems(normalizeCart(parsed));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const value = useMemo<CartContextValue>(() => {
    const storeCounts: Record<string, number> = {};
    for (const line of items) {
      if (line.storeId) storeCounts[line.storeId] = (storeCounts[line.storeId] ?? 0) + 1;
    }
    return {
      items,
      count: items.length,
      storeCounts,
      add: (storeId, productId) =>
        setItems((current) => addCartProduct(current, storeId, productId)),
      assignStore: (productId, storeId) => {
        if (!UUID.test(storeId)) return;
        setItems((current) => current.map((line) =>
          line.productId === productId && !line.storeId ? { ...line, storeId } : line
        ));
      },
      remove: (productId) => setItems((current) => current.filter((line) => line.productId !== productId)),
      clear: (storeId) => setItems((current) =>
        storeId ? current.filter((line) => line.storeId !== storeId) : []
      ),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
