import { useEffect, useState } from "react";

type Rates = { USD: number; EUR: number; fetchedAt: number };
const CACHE_KEY = "algorea.tnd-fx.v1";
const CACHE_MS = 6 * 60 * 60 * 1000;

function readCache(): Rates | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Rates;
    return Date.now() - parsed.fetchedAt < CACHE_MS ? parsed : null;
  } catch {
    return null;
  }
}

export function useTndRates() {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    let active = true;
    const cached = readCache();
    if (cached) setRates(cached);
    fetch("https://open.er-api.com/v6/latest/TND")
      .then((response) => {
        if (!response.ok) throw new Error("fx_unavailable");
        return response.json() as Promise<{ result: string; rates?: Record<string, number> }>;
      })
      .then((data) => {
        const usd = data.rates?.USD;
        const eur = data.rates?.EUR;
        if (data.result !== "success" || !usd || !eur) throw new Error("fx_invalid");
        const next = { USD: usd, EUR: eur, fetchedAt: Date.now() };
        if (active) {
          setRates(next);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* storage optional */ }
        }
      })
      .catch(() => {
        // Never present expired cached rates as current; TND remains the authoritative price.
        if (active && !cached) setRates(null);
      });
    return () => { active = false; };
  }, []);
  return rates;
}

export function TndEquivalents({ millimes, locale = "fr-FR" }: { millimes: number; locale?: string }) {
  const rates = useTndRates();
  if (!rates) return null;
  const tnd = millimes / 1000;
  const format = (value: number, currency: "USD" | "EUR") =>
    new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  return (
    <span className="mt-1 block text-xs font-medium text-muted-foreground">
      ≈ {format(tnd * rates.USD, "USD")} · {format(tnd * rates.EUR, "EUR")}
    </span>
  );
}
