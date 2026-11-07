import { useState } from "react";
import { useLang } from "@/lib/i18n";

// prettier-ignore
const logoBaseClass = [
  "flex h-10 min-w-16 shrink-0 items-center justify-center",
  "rounded-lg px-2 text-xs font-extrabold tracking-tight",
].join(" ");

// prettier-ignore
const logoStyles: Record<string, string> = {
  KONNECT: "bg-[#102f3d] text-white",
  Cards: "bg-white text-[#1434a4] ring-1 ring-border",
  "e-DINAR": "bg-[#f4efe6] text-[#8b6b20] ring-1 ring-[#c5a869]",
  iPay: "bg-[#e8f3ff] text-[#1769aa] ring-1 ring-[#b7d7f0]",
  D17: "bg-[#f1e9fb] text-[#7136a8] ring-1 ring-[#d7c2ef]",
  Flouci: "bg-[#e7f8f1] text-[#07845a] ring-1 ring-[#b9e7d5]",
  ClicToPay: "bg-[#e9efff] text-[#2448a5] ring-1 ring-[#c4d1fa]",
  Ooredoo: "bg-[#fff0f0] text-[#d71920] ring-1 ring-[#f5c4c6]",
  "Tunisie Telecom": "bg-[#e8f5ff] text-[#0877b9] ring-1 ring-[#b9def4]",
  WinSMS: "bg-[#fff4e8] text-[#a65308] ring-1 ring-[#f1d1ad]",
  "Postal / Bank": "bg-[#f4f0e8] text-[#75613d] ring-1 ring-[#ded3bd]",
};

// prettier-ignore
function PaymentBrandMark({ brand }: { brand: string }) {
  const brandClass = logoStyles[brand] ?? "bg-secondary text-foreground";

  // prettier-ignore
  return (
    <span aria-hidden="true" className={`${logoBaseClass} ${brandClass}`}>
      {brand === "Cards" ? (
        <span className="flex items-center gap-2">
          <span className="font-black italic text-[#1434a4]">VISA</span>
          <span className="flex -space-x-2">
            <span className="h-4 w-4 rounded-full bg-[#eb001b]" />
            <span className="h-4 w-4 rounded-full bg-[#f79e1b]" />
          </span>
        </span>
      ) : (
        brand
      )}
    </span>
  );
}

// prettier-ignore
type PaymentMethod = {
  id: string;
  label: string;
  brand: string;
};

// prettier-ignore
function PaymentOption({
  method,
  selected,
  onSelect,
}: {
  method: PaymentMethod;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const selectedClass = "border-petrol bg-cream-light ring-1 ring-petrol";
  const unselectedClass = "border-border bg-background hover:bg-secondary";
  const optionClass =
    "flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start transition-colors";
  const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const optionClasses = [
    optionClass,
    focusClass,
    selected ? selectedClass : unselectedClass,
  ].join(" ");
  const checkmarkBase =
    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs";
  const checkmarkClass = `${checkmarkBase} ${
    selected
      ? "border-petrol bg-petrol text-white"
      : "border-muted-foreground/40 text-transparent"
  }`;

  // prettier-ignore
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(method.id)}
      className={optionClasses}
    >
      <PaymentBrandMark brand={method.brand} />
      <span className="flex-1 text-sm font-semibold">{method.label}</span>
      <span aria-hidden="true" className={checkmarkClass}>✓</span>
    </button>
  );
}

// prettier-ignore
export function PaymentMethodsPreview() {
  const { t } = useLang();
  const m = t.marketplace;
  const [selected, setSelected] = useState("konnect:bank_card");

  const konnectMethods: PaymentMethod[] = [
    { id: "konnect:bank_card", label: m.paymentKonnectBankCard, brand: "Cards" },
    { id: "konnect:wallet", label: m.paymentKonnectWallet, brand: "KONNECT" },
    { id: "konnect:e-DINAR", label: m.paymentKonnectEdinar, brand: "e-DINAR" },
  ];
  const internationalCardMethod: PaymentMethod = {
    id: "konnect:bank_card",
    label: m.paymentKonnectBankCard,
    brand: "Cards",
  };
  const ipayMethods: PaymentMethod[] = [
    { id: "ipay:clictopay", label: m.paymentClicToPay, brand: "ClicToPay" },
    { id: "ipay:flouci", label: m.paymentFlouci, brand: "Flouci" },
    { id: "ipay:postal", label: m.paymentPostal, brand: "Postal / Bank" },
    { id: "ipay:ooredoo-sms", label: m.paymentOoredooSms, brand: "Ooredoo" },
    {
      id: "ipay:tunisie-telecom-sms",
      label: m.paymentTunisieTelecomSms,
      brand: "Tunisie Telecom",
    },
    { id: "ipay:bank-transfer", label: m.paymentBankTransfer, brand: "Postal / Bank" },
    { id: "ipay:winsms", label: m.paymentWinSms, brand: "WinSMS" },
  ];

  // prettier-ignore
  return (
    <>
      <p className="mt-3 text-sm text-muted-foreground">{m.paymentSelectPrompt}</p>
      <div className="mt-5 rounded-xl border border-border p-4">
        <h3 className="text-base font-bold">{m.paymentTunisiaTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{m.paymentTunisiaNote}</p>

        <h4 className="mt-4 flex items-center gap-2 text-sm font-bold">
          <PaymentBrandMark brand="KONNECT" />
          {m.paymentProviderKonnect}
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {konnectMethods.map((method) => (
            <PaymentOption
              key={method.id}
              method={method}
              selected={selected === method.id}
              onSelect={setSelected}
            />
          ))}
        </div>

        <h4 className="mt-6 text-sm font-bold">{m.paymentD17Title}</h4>
        <div className="mt-3">
          <PaymentOption
            method={{ id: "d17", label: m.paymentD17Label, brand: "D17" }}
            selected={selected === "d17"}
            onSelect={setSelected}
          />
        </div>

        <h4 className="mt-6 flex items-center gap-2 text-sm font-bold">
          <PaymentBrandMark brand="iPay" />
          {m.paymentProviderIpay}
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ipayMethods.map((method) => (
            <PaymentOption
              key={method.id}
              method={method}
              selected={selected === method.id}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border p-4">
        <h3 className="text-base font-bold">{m.paymentInternationalTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{m.paymentInternationalNote}</p>
        <h4 className="mt-4 flex items-center gap-2 text-sm font-bold">
          <PaymentBrandMark brand="KONNECT" />
          {m.paymentProviderKonnect}
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PaymentOption
            method={internationalCardMethod}
            selected={selected === internationalCardMethod.id}
            onSelect={setSelected}
          />
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-secondary p-4 text-sm leading-7">
        {m.purchaseUnavailable}
      </p>
    </>
  );
}
