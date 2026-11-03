import { useEffect, useState } from "react";

type TndRates = { USD: number; EUR: number; fetchedAt: number };
const CACHE_KEY = "algoreabazaar.tnd-fx.v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function readFreshCache(): TndRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TndRates>;
    const age = Date.now() - Number(parsed.fetchedAt);
    if (!Number.isFinite(parsed.USD) || !Number.isFinite(parsed.EUR) ||
        Number(parsed.USD) <= 0 || Number(parsed.EUR) <= 0 ||
        !Number.isFinite(age) || age < 0 || age >= CACHE_TTL_MS) return null;
    return { USD: Number(parsed.USD), EUR: Number(parsed.EUR), fetchedAt: Number(parsed.fetchedAt) };
  } catch {
    return null;
  }
}

export function useTndRates(): TndRates | null {
  const [rates, setRates] = useState<TndRates | null>(null);
  useEffect(() => {
    let active = true;
    const cached = readFreshCache();
    if (cached) setRates(cached);
    fetch("https://open.er-api.com/v6/latest/TND")
      .then((response) => {
        if (!response.ok) throw new Error("exchange_rates_unavailable");
        return response.json() as Promise<{ result?: string; rates?: Record<string, number> }>;
      })
      .then((data) => {
        const USD = data.rates?.USD;
        const EUR = data.rates?.EUR;
        if (data.result !== "success" || !Number.isFinite(USD) || !Number.isFinite(EUR) || !USD || !EUR) {
          throw new Error("exchange_rates_invalid");
        }
        const next = { USD, EUR, fetchedAt: Date.now() };
        if (!active) return;
        setRates(next);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* Storage is optional. */ }
      })
      .catch(() => {
        // Expired rates are never displayed; TND remains the authoritative price.
        if (active && !cached) setRates(null);
      });
    return () => { active = false; };
  }, []);
  return rates;
}

export function TndEquivalents({ millimes, locale = "fr-FR" }: { millimes: number; locale?: string }) {
  const rates = useTndRates();
  if (!rates || !Number.isFinite(millimes) || millimes < 0) return null;
  const tnd = millimes / 1000;
  const format = (amount: number, currency: "USD" | "EUR") =>
    new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  return (
    <span className="mt-1 block text-xs font-medium text-muted-foreground" aria-label="Approximate USD and EUR equivalents">
      ≈ {format(tnd * rates.USD, "USD")} · {format(tnd * rates.EUR, "EUR")}
    </span>
  );
}
