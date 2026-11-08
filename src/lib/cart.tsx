import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.flatMap((line): string[] => {
    const id = line && typeof line.productId === "string" ? line.productId : "";
    return PRODUCT_ID_PATTERN.test(id) ? [id] : [];
  });
  return [...new Set(ids)].slice(0, 50).map((productId) => ({ productId }));
}

export function addCartProduct(current: CartLine[], productId: string): CartLine[] {
  if (current.some((line) => line.productId === productId) || current.length >= 50) {
    return current;
  }
  return [...current, { productId }];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        // Migrate old quantity-based carts to one entitlement per distinct product.
        setItems(normalizeCart(parsed));
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
      add: (productId) => setItems((current) => addCartProduct(current, productId)),
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
