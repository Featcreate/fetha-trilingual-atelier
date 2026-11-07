import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartLine = { productId: string; quantity: number };

type CartContextValue = {
  items: CartLine[];
  count: number;
  add: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
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
          const safe = parsed.flatMap((line): CartLine[] => {
            if (
              line &&
              typeof line.productId === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                line.productId,
              ) &&
              Number.isInteger(line.quantity) &&
              line.quantity >= 1 &&
              line.quantity <= 99
            ) {
              return [{ productId: line.productId, quantity: line.quantity }];
            }
            return [];
          });
          setItems(safe.slice(0, 50));
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
      count: items.reduce((sum, line) => sum + line.quantity, 0),
      add: (productId) =>
        setItems((current) => {
          const found = current.find((line) => line.productId === productId);
          if (found) {
            return current.map((line) =>
              line.productId === productId
                ? { ...line, quantity: Math.min(99, line.quantity + 1) }
                : line,
            );
          }
          return current.length >= 50
            ? current
            : [...current, { productId, quantity: 1 }];
        }),
      setQuantity: (productId, quantity) =>
        setItems((current) =>
          !Number.isFinite(quantity)
            ? current
            : quantity <= 0
              ? current.filter((line) => line.productId !== productId)
              : current.map((line) =>
                  line.productId === productId
                    ? { ...line, quantity: Math.min(99, Math.max(1, Math.floor(quantity))) }
                    : line,
                ),
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
