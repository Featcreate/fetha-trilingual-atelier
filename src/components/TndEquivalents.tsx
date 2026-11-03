import { useEffect, useState } from "react";

type TndRates = { USD: number; EUR: number; fetchedAt: number };
const CACHE_KEY = "algoreabazaar.tnd-fx.v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let memoryRates: TndRates | null = null;
let ratesRequest: Promise<TndRates | null> | null = null;

function isFresh(rates: TndRates | null): rates is TndRates {
  if (!rates) return false;
  const age = Date.now() - rates.fetchedAt;
  return Number.isFinite(rates.USD) && Number.isFinite(rates.EUR) &&
    rates.USD > 0 && rates.EUR > 0 && age >= 0 && age < CACHE_TTL_MS;
}

function readFreshCache(): TndRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TndRates>;
    const candidate = {
      USD: Number(parsed.USD),
      EUR: Number(parsed.EUR),
      fetchedAt: Number(parsed.fetchedAt),
    };
    return isFresh(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function loadTndRates(): Promise<TndRates | null> {
  if (isFresh(memoryRates)) return Promise.resolve(memoryRates);
  const cached = readFreshCache();
  if (cached) memoryRates = cached;
  if (ratesRequest) return ratesRequest;

  ratesRequest = fetch("https://open.er-api.com/v6/latest/TND")
    .then((response) => {
      if (!response.ok) throw new Error("exchange_rates_unavailable");
      return response.json() as Promise<{ result?: string; rates?: Record<string, number> }>;
    })
    .then((data) => {
      const USD = data.rates?.USD;
      const EUR = data.rates?.EUR;
      if (data.result !== "success" || !Number.isFinite(USD) ||
          !Number.isFinite(EUR) || !USD || !EUR) {
        throw new Error("exchange_rates_invalid");
      }
      const next = { USD, EUR, fetchedAt: Date.now() };
      memoryRates = next;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // Storage is optional; the in-memory rate remains available for this session.
      }
      return next;
    })
    .catch(() => cached ?? null)
    .finally(() => {
      ratesRequest = null;
    });
  return ratesRequest;
}

export function useTndRates(): TndRates | null {
  const [rates, setRates] = useState<TndRates | null>(null);
  useEffect(() => {
    let active = true;
    const cached = readFreshCache();
    if (cached) {
      memoryRates = cached;
      setRates(cached);
    }
    void loadTndRates().then((next) => {
      if (active) setRates(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return rates;
}

export function TndEquivalents({
  millimes,
  locale = "fr-FR",
}: {
  millimes: number;
  locale?: string;
}) {
  const rates = useTndRates();
  if (!rates || !Number.isFinite(millimes) || millimes < 0) return null;
  const tnd = millimes / 1000;
  const format = (amount: number, currency: "USD" | "EUR") =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  return (
    <span
      className="mt-1 block text-xs font-medium text-muted-foreground"
      aria-label="Approximate USD and EUR equivalents"
    >
      ≈ {format(tnd * rates.USD, "USD")} · {format(tnd * rates.EUR, "EUR")}
    </span>
  );
}
