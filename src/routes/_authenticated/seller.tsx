import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useLang } from "@/lib/i18n";
import { formatTND, parseTNDToMillimes } from "@/lib/money";
import { TndEquivalents } from "@/components/TndEquivalents";
import {
  PRODUCT_CATEGORIES,
  getCategory,
  isValidProductCategory,
  type ProductType,
} from "@/lib/product-categories";
import {
  IMAGE_ACCEPT,
  validPreviewImage,
  saveProductPreviews,
  loadProductGallery,
} from "@/lib/product-previews";
import { ProductPreview } from "@/components/ProductPreview";
import { translateProductContent } from "@/lib/product-translations";
import { MAX_PRODUCT_FILE_BYTES, uploadProductFile } from "@/lib/storage-upload";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { StoreBrandingEditor } from "@/components/StoreBrandingEditor";
import {
  activateSellerFileVersion,
  archiveSellerFileVersion,
  createSellerStore,
  deleteSellerFileVersion,
  listSellerFileVersions,
  registerSellerFileVersion,
} from "@/lib/seller-security.functions";
import {
  SellerLegalAcceptance,
  SELLER_PRIVACY_VERSION,
  SELLER_TERMS_VERSION,
} from "@/components/SellerLegalAcceptance";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({
    meta: [
      { title: "Espace vendeur — Algorea Bazaar" },
      {
        name: "description",
        content: "Gérez votre boutique et vos produits numériques sur Algorea Bazaar.",
      },
      { property: "og:title", content: "Espace vendeur — Algorea Bazaar" },
      {
        property: "og:description",
        content: "Gérez votre boutique et vos produits numériques sur Algorea Bazaar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerPage,
});

type Store = Database["public"]["Tables"]["stores"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
const MAX_FILE_BYTES = MAX_PRODUCT_FILE_BYTES;
const DEFAULT_CATEGORY = PRODUCT_CATEGORIES[0]!;
const DEFAULT_CATEGORY_ID = DEFAULT_CATEGORY.id;
const DEFAULT_SUBCATEGORY_ID = DEFAULT_CATEGORY.subcategories[0]!.id;

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}
function safeFileName(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._ -]/g, "_")
      .replace(/\.\./g, "_")
      .replace(/^[^A-Za-z0-9]+/, "")
      .slice(0, 180) || "digital-file.bin"
  );
}

function SellerPage() {
  const { lang, setLang, t } = useLang();
  const m = t.marketplace;
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingStore, setEditingStore] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptSellerTerms, setAcceptSellerTerms] = useState(false);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const payoutMethod = "bank_transfer";
  const [newCategoryId, setNewCategoryId] = useState(DEFAULT_CATEGORY_ID);
  const [newSubcategoryId, setNewSubcategoryId] = useState(DEFAULT_SUBCATEGORY_ID);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSubcategoryId, setEditSubcategoryId] = useState("");

  const storeQuery = useQuery({
    queryKey: ["seller-store", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Store | null;
    },
  });
  const store = storeQuery.data;
  const settingsQuery = useQuery({
    queryKey: ["platform-commission"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("commission_bps")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data.commission_bps;
    },
  });

  const productsQuery = useQuery({
    queryKey: ["seller-products", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["seller-orders", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(
          "id, order_id, product_name, quantity, gross_millimes, commission_millimes, seller_net_millimes, orders!inner(id,status,created_at,total_millimes)",
        )
        .eq("seller_id", user.id);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        order_id: string;
        product_name: string;
        quantity: number;
        gross_millimes: number | null;
        commission_millimes: number | null;
        seller_net_millimes: number | null;
        orders: { id: string; status: string; created_at: string; total_millimes: number } | null;
      }>;
    },
  });

  const payoutPreferenceQuery = useQuery({
    queryKey: ["seller-payout-preference", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_payout_preferences")
        .select(
          "id,method,account_holder_name,provider_name,account_identifier,bank_name,additional_details,updated_at",
        )
        .eq("store_id", store!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Seller payouts are currently bank-transfer only; keep the UI ready for future methods.

  const payoutHistoryQuery = useQuery({
    queryKey: ["seller-payout-history", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_payouts")
        .select(
          "id,status,seller_amount_millimes,external_fees_millimes,currency,created_at,paid_at,provider_transfer_ref,payout_destination_method",
        )
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  const sellerEarningsQuery = useQuery({
    queryKey: ["seller-ledger-earnings", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      let total = 0;
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("seller_ledger_entries")
          .select("amount_millimes")
          .eq("store_id", store!.id)
          .eq("entry_type", "sale_net")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data ?? [];
        total += page.reduce((sum, entry) => sum + Number(entry.amount_millimes), 0);
        if (page.length < pageSize) return total;
      }
    },
  });
  const sellerPayoutBalancesQuery = useQuery({
    queryKey: ["seller-ledger-payout-balances", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const rows: Array<{ status: string; seller_amount_millimes: number }> = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("seller_payouts")
          .select("status,seller_amount_millimes")
          .eq("store_id", store!.id)
          .neq("status", "cancelled")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },
  });

  async function resendSellerConfirmation() {
    if (!user.email) return;
    setConfirmationBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
    setConfirmationBusy(false);
    setNotice(
      error
        ? m.error
        : lang === "ar"
          ? "طلبنا إعادة إرسال رسالة تأكيد البريد الإلكتروني."
          : lang === "en"
            ? "A new email confirmation message has been requested."
            : "Un nouvel e-mail de confirmation a été demandé.",
    );
  }

  async function createStore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("store_name") ?? "").trim();
    const slug = slugify(String(form.get("store_slug") || name));
    if (!name) return setNotice(m.nameRequired);
    if (slug.length < 3) return setNotice(m.slugHint);
    if (!user.email_confirmed_at) return setNotice(m.emailVerificationRequired);
    if (!acceptPrivacy || !acceptSellerTerms) {
      return setNotice(
        lang === "ar"
          ? "يجب قراءة الوثيقتين والموافقة على كل واحدة منهما لإنشاء المتجر."
          : lang === "en"
            ? "Read and accept each document separately before creating your store."
            : "Lisez et acceptez séparément chaque document avant de créer votre boutique.",
      );
    }
    setBusy(true);
    setNotice("");
    const { error } = await createSellerStore({
      data: {
        name,
        slug,
        privacyVersion: SELLER_PRIVACY_VERSION,
        termsVersion: SELLER_TERMS_VERSION,
        language: lang,
      },
    });
    setBusy(false);
    if (error) {
      const detail = error.message.toLowerCase();
      return setNotice(
        detail.includes("email_verification_required")
          ? m.emailVerificationRequired
          : detail.includes("legal_documents_outdated")
            ? lang === "ar"
              ? "إصدار الوثائق غير صالح. حدّث الصفحة وحاول مجدداً."
              : lang === "en"
                ? "The legal document version is outdated. Refresh and try again."
                : "La version des documents est obsolète. Actualisez la page et réessayez."
            : error.code === "23505"
              ? m.slugHint
              : m.error,
      );
    }
    setNotice(m.storeCreated);
    await qc.invalidateQueries({ queryKey: ["seller-store", user.id] });
  }

  async function savePayoutPreference(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!store) return;
    const values = new FormData(e.currentTarget);
    const method = "bank_transfer";
    const accountHolderName = String(values.get("account_holder_name") ?? "").trim();
    const accountIdentifier = String(values.get("account_identifier") ?? "").trim();
    const bankName = String(values.get("bank_name") ?? "").trim();
    if (!accountHolderName || !accountIdentifier) {
      setNotice(
        lang === "ar"
          ? "أدخل اسم صاحب الحساب ومعرّف الحساب."
          : lang === "en"
            ? "Enter the account holder name and account identifier."
            : "Saisissez le titulaire et l’identifiant du compte.",
      );
      return;
    }
    if (!bankName) {
      setNotice(
        lang === "ar"
          ? "أدخل اسم البنك لإتمام بيانات التحويل البنكي."
          : lang === "en"
            ? "Enter the bank name for a bank transfer."
            : "Saisissez le nom de la banque pour un virement bancaire.",
      );
      return;
    }
    setBusy(true);
    setNotice("");
    const { error } = await supabase.from("seller_payout_preferences").upsert(
      {
        store_id: store.id,
        method,
        account_holder_name: accountHolderName,
        account_identifier: accountIdentifier,
        provider_name: null,
        bank_name: bankName || null,
        additional_details: String(values.get("additional_details") ?? "").trim() || null,
        konnect_wallet_id: null,
      },
      { onConflict: "store_id" },
    );
    setBusy(false);
    if (error)
      return setNotice(
        error.message.includes("payout_destination_details_required")
          ? lang === "ar"
            ? "بيانات الاستلام الأساسية مطلوبة."
            : lang === "en"
              ? "Required payout details are missing."
              : "Les informations de réception obligatoires sont manquantes."
          : m.error,
      );
    setNotice(m.productUpdated);
    await qc.invalidateQueries({ queryKey: ["seller-payout-preference", store.id] });
  }

  async function uploadFile(
    productId: string,
    file: File,
  ): Promise<"ok" | "quota" | "email" | "error"> {
    const fileName = safeFileName(file.name);
    const { data: versionRows, error: registerError } = await registerSellerFileVersion({
      data: {
        productId,
        fileName,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        sha256: "",
      },
    });
    const rawVersion = Array.isArray(versionRows) ? versionRows[0] : versionRows;
    const version = rawVersion as { version_id?: string; upload_path?: string } | null;
    if (registerError) {
      if (registerError.message.includes("storage_quota_exceeded")) return "quota";
      if (registerError.message.includes("email_verification_required")) return "email";
      return "error";
    }
    if (!version?.upload_path || !version?.version_id) return "error";
    try {
      await uploadProductFile(version.upload_path, file, setUploadProgress);
      setUploadProgress(null);
    } catch {
      setUploadProgress(null);
      return "error";
    }
    const { error: activateError } = await activateSellerFileVersion({
      data: { versionId: version.version_id },
    });
    return activateError ? "error" : "ok";
  }

  async function addProduct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!store) return;
    const form = e.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const description = String(values.get("description") ?? "").trim();
    const price = parseTNDToMillimes(String(values.get("price") ?? ""));
    const salePriceInput = String(values.get("sale_price") ?? "").trim();
    const salePrice = salePriceInput ? parseTNDToMillimes(salePriceInput) : null;
    const productType = String(values.get("product_type") ?? "");
    const productSubcategory = String(values.get("product_subcategory") ?? "");
    const files = values
      .getAll("digital_files")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const imageValue = values.get("product_image");
    const imageFile = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
    const galleryFiles = values
      .getAll("product_gallery")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (!name || !description) return setNotice(m.productRequired);
    if (!price) return setNotice(m.invalidPrice);
    if (salePriceInput && (!salePrice || salePrice >= price)) return setNotice(m.invalidSalePrice);
    if (!files.length || files.some((file) => file.size < 1 || file.size > MAX_FILE_BYTES))
      return setNotice(m.invalidFile);
    if (
      [...(imageFile ? [imageFile] : []), ...galleryFiles].some((file) => !validPreviewImage(file))
    ) {
      return setNotice(m.invalidFile);
    }
    if (!isValidProductCategory(productType, productSubcategory)) return setNotice(m.error);
    setBusy(true);
    setNotice("");
    let translatedContent: Awaited<ReturnType<typeof translateProductContent>> | null = null;
    try {
      translatedContent = await translateProductContent(name, description);
    } catch {
      // Translation is optional: preserve the seller's original content and allow upload.
    }
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        store_id: store.id,
        name,
        description,
        name_translations: translatedContent?.nameTranslations ?? {},
        description_translations: translatedContent?.descriptionTranslations ?? {},
        price_millimes: price,
        sale_price_millimes: salePrice,
        product_type: productType as ProductType,
        product_subcategory: productSubcategory,
        is_active: false,
      })
      .select("id")
      .single();
    if (productError || !product) {
      setBusy(false);
      return setNotice(m.error);
    }

    try {
      await saveProductPreviews(store.id, product.id, imageFile, galleryFiles);
    } catch (error) {
      setBusy(false);
      return setNotice(
        error instanceof Error && error.message === "preview_setup_required"
          ? m.previewSetupRequired
          : m.previewSaveFailed,
      );
    }

    for (const file of files) {
      const uploaded = await uploadFile(product.id, file);
      if (uploaded !== "ok") {
        setBusy(false);
        return setNotice(
          uploaded === "quota"
            ? m.storageQuotaExceeded
            : uploaded === "email"
              ? m.emailVerificationRequired
              : m.fileUploadFailed,
        );
      }
    }
    const { error: publishError } = await supabase
      .from("products")
      .update({ is_active: true })
      .eq("id", product.id)
      .eq("store_id", store.id);
    setBusy(false);
    if (publishError) return setNotice(m.fileUploadFailed);
    form.reset();
    setCoverPreview(null);
    setGalleryPreviews([]);
    setNewCategoryId(DEFAULT_CATEGORY_ID);
    setNewSubcategoryId(DEFAULT_SUBCATEGORY_ID);
    setNotice(translatedContent ? m.productCreated : m.translationSavedWithoutTranslation);
    await qc.invalidateQueries({ queryKey: ["seller-products", store.id] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
  }

  async function saveStore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!store) return;
    const name = String(new FormData(e.currentTarget).get("store_name") ?? "").trim();
    if (!name) return setNotice(m.nameRequired);
    setBusy(true);
    const { error } = await supabase
      .from("stores")
      .update({ name })
      .eq("id", store.id)
      .eq("owner_id", user.id);
    setBusy(false);
    if (error) return setNotice(m.error);
    setEditingStore(false);
    setNotice(m.productUpdated);
    await qc.invalidateQueries({ queryKey: ["seller-store", user.id] });
  }

  async function addFilesToProduct(product: Product, files: File[]) {
    if (!store || !files.length) return;
    if (files.some((file) => file.size < 1 || file.size > MAX_FILE_BYTES))
      return setNotice(m.invalidFile);
    setBusy(true);
    setNotice("");
    for (const file of files) {
      const uploaded = await uploadFile(product.id, file);
      if (uploaded !== "ok") {
        setBusy(false);
        return setNotice(
          uploaded === "quota"
            ? m.storageQuotaExceeded
            : uploaded === "email"
              ? m.emailVerificationRequired
              : m.fileUploadFailed,
        );
      }
    }
    setBusy(false);
    setNotice(m.productUpdated);
    await qc.invalidateQueries({ queryKey: ["seller-file-versions", product.id] });
  }

  async function toggleProduct(product: Product) {
    if (!store) return;
    if (!product.is_active) {
      const { data: versions, error: versionsError } = await supabase
        .from("product_file_versions")
        .select("id")
        .eq("product_id", product.id)
        .eq("status", "active")
        .limit(1);
      if (versionsError || !versions?.length) return setNotice(m.fileUploadFailed);
    }
    const { error } = await supabase
      .from("products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id)
      .eq("store_id", store.id);
    if (error) return setNotice(m.error);
    await qc.invalidateQueries({ queryKey: ["seller-products", store.id] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
  }

  async function deleteProduct(product: Product) {
    if (!store || busy) return;
    if (!window.confirm(m.deleteProductConfirmation)) return;
    setBusy(true);
    setNotice("");
    const { error } = await supabase
      .from("products")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", product.id)
      .eq("store_id", store.id)
      .is("deleted_at", null);
    setBusy(false);
    if (error) return setNotice(m.deleteProductFailed);
    setNotice(m.productDeleted);
    await qc.invalidateQueries({ queryKey: ["seller-products", store.id] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
    await qc.invalidateQueries({ queryKey: ["storefront"] });
  }

  async function saveProduct(e: FormEvent<HTMLFormElement>, product: Product) {
    e.preventDefault();
    if (!store) return;
    const f = new FormData(e.currentTarget);
    const name = String(f.get(`edit_name_${product.id}`) ?? "").trim();
    const description = String(f.get(`edit_description_${product.id}`) ?? "").trim();
    const price = parseTNDToMillimes(String(f.get(`edit_price_${product.id}`) ?? ""));
    const salePriceInput = String(f.get(`edit_sale_price_${product.id}`) ?? "").trim();
    const salePrice = salePriceInput ? parseTNDToMillimes(salePriceInput) : null;
    if (!name || !description) return setNotice(m.productRequired);
    if (!price) return setNotice(m.invalidPrice);
    if (salePriceInput && (!salePrice || salePrice >= price)) return setNotice(m.invalidSalePrice);
    const productType = String(f.get(`edit_type_${product.id}`) ?? "");
    const productSubcategory = String(f.get(`edit_subcategory_${product.id}`) ?? "");
    if (!isValidProductCategory(productType, productSubcategory)) return setNotice(m.error);
    const coverValue = f.get(`edit_cover_${product.id}`);
    const cover = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
    const gallery = f
      .getAll(`edit_gallery_${product.id}`)
      .filter((value): value is File => value instanceof File && value.size > 0);
    if ([...(cover ? [cover] : []), ...gallery].some((file) => !validPreviewImage(file)))
      return setNotice(m.invalidFile);
    setBusy(true);
    let translatedContent: Awaited<ReturnType<typeof translateProductContent>> | null = null;
    try {
      translatedContent = await translateProductContent(name, description);
    } catch {
      // Clear stale translations below; the original seller content remains authoritative.
    }
    try {
      await saveProductPreviews(store.id, product.id, cover, gallery);
      const { error } = await supabase
        .from("products")
        .update({
          name,
          description,
          name_translations: translatedContent?.nameTranslations ?? {},
          description_translations: translatedContent?.descriptionTranslations ?? {},
          price_millimes: price,
          sale_price_millimes: salePrice,
          product_type: productType,
          product_subcategory: productSubcategory,
        })
        .eq("id", product.id)
        .eq("store_id", store.id);
      if (error) throw error;
    } catch (error) {
      await qc.invalidateQueries({ queryKey: ["seller-products", store.id] });
      await qc.invalidateQueries({ queryKey: ["seller-product-gallery", product.id] });
      return setNotice(
        error instanceof Error && error.message === "translation_failed"
          ? m.translationFailed
          : error instanceof Error && error.message === "preview_setup_required"
            ? m.previewSetupRequired
            : m.previewSaveFailed,
      );
    } finally {
      setBusy(false);
    }
    await qc.invalidateQueries({ queryKey: ["seller-product-gallery", product.id] });
    setEditing(null);
    setNotice(translatedContent ? m.productUpdated : m.translationSavedWithoutTranslation);
    await qc.invalidateQueries({ queryKey: ["seller-products", store.id] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
  }

  const sortedOrders = useMemo(
    () =>
      [...(ordersQuery.data ?? [])].sort((a, b) =>
        (b.orders?.created_at ?? "").localeCompare(a.orders?.created_at ?? ""),
      ),
    [ordersQuery.data],
  );
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";
  const sellerEarned = sellerEarningsQuery.data ?? 0;
  const sellerPayoutTotals = (sellerPayoutBalancesQuery.data ?? []).reduce(
    (totals, payout) => {
      if (payout.status === "paid") totals.transferred += Number(payout.seller_amount_millimes);
      else if (payout.status !== "cancelled")
        totals.reserved += Number(payout.seller_amount_millimes);
      return totals;
    },
    { transferred: 0, reserved: 0 },
  );
  const sellerAvailable = Math.max(
    0,
    sellerEarned - sellerPayoutTotals.transferred - sellerPayoutTotals.reserved,
  );

  return (
    <AuthShell lang={lang} setLang={setLang} title={m.sellerArea} wide>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to="/catalog" className="font-semibold text-coral hover:underline">
            {m.viewCatalog}
          </Link>
          {store && (
            <Link
              to="/stores/$slug"
              params={{ slug: store.slug }}
              className="font-semibold text-coral hover:underline"
            >
              {m.storePublic}
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{m.freeForever}</p>
      </div>
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-secondary p-3 text-sm">
          {notice}
        </p>
      )}
      {storeQuery.isPending ? (
        <p>{m.loading}</p>
      ) : storeQuery.isError ? (
        <p role="alert">{m.error}</p>
      ) : !store ? (
        <section className="rounded-xl border border-border p-5">
          <h2 className="text-lg font-bold">{m.store}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{m.noStore}</p>
          {!user.email_confirmed_at && (
            <div className="mt-4 rounded-xl bg-secondary p-4">
              <p className="text-sm font-semibold">{m.emailVerificationRequired}</p>
              <button
                type="button"
                onClick={resendSellerConfirmation}
                disabled={confirmationBusy}
                className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {confirmationBusy
                  ? m.loading
                  : lang === "ar"
                    ? "إعادة إرسال رسالة التأكيد"
                    : lang === "en"
                      ? "Resend confirmation email"
                      : "Renvoyer l’e-mail de confirmation"}
              </button>
            </div>
          )}
          <form onSubmit={createStore} className="mt-5 space-y-4">
            <Field id="store_name" name="store_name" label={m.storeName} required maxLength={120} />
            <Field
              id="store_slug"
              name="store_slug"
              label={m.storeSlug}
              placeholder="ma-boutique"
            />
            <p className="text-xs text-muted-foreground">{m.slugHint}</p>
            <SellerLegalAcceptance
              lang={lang}
              privacyAccepted={acceptPrivacy}
              termsAccepted={acceptSellerTerms}
              onPrivacyChange={setAcceptPrivacy}
              onTermsChange={setAcceptSellerTerms}
            />
            <SubmitButton busy={busy} label={m.createStore} busyLabel={m.loading} />
          </form>
        </section>
      ) : (
        <div className="space-y-8">
          <section className="rounded-xl border border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{m.storeExists}</p>
                <h2 className="text-xl font-bold">{store.name}</h2>
                <p className="text-sm text-muted-foreground" dir="ltr">
                  /stores/{store.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs">{m.freeForever}</span>
                <button
                  type="button"
                  onClick={() => setEditingStore(!editingStore)}
                  className="rounded-full border border-border px-3 py-2 text-xs font-semibold"
                >
                  {m.editStore}
                </button>
              </div>
            </div>
            {editingStore && (
              <form onSubmit={saveStore} className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Field
                    id="store_name_edit"
                    name="store_name"
                    label={m.storeName}
                    defaultValue={store.name}
                    required
                    maxLength={120}
                  />
                </div>
                <button
                  disabled={busy}
                  className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {m.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStore(false)}
                  className="rounded-full border border-border px-4 py-2.5 text-sm"
                >
                  {m.cancel}
                </button>
              </form>
            )}
            <StoreBrandingEditor
              store={store}
              onSaved={() => qc.invalidateQueries({ queryKey: ["seller-store", user.id] })}
            />
          </section>

          <section className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-7">
            {settingsQuery.isPending
              ? m.loading
              : settingsQuery.isError
                ? m.error
                : settingsQuery.data === null
                  ? m.commissionUnset
                  : m.commissionDisclosure.replace(
                      "{value}",
                      `${(settingsQuery.data / 100).toFixed(2)}%`,
                    )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold">{m.addProduct}</h2>
            <form onSubmit={addProduct} className="grid gap-4 rounded-xl border border-border p-5">
              <Field id="name" label={m.productName} required maxLength={180} />
              <div>
                <label htmlFor="description" className="mb-1 block text-sm font-medium">
                  {m.description}
                </label>
                <textarea
                  id="description"
                  name="description"
                  required
                  rows={3}
                  maxLength={5000}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                />
                <p className="mt-1 text-xs text-muted-foreground">{m.automaticTranslation}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Field
                    id="price"
                    label={m.price}
                    required
                    inputMode="decimal"
                    placeholder="12.500"
                  />
                  <Field
                    id="sale_price"
                    label={m.salePriceOptional}
                    inputMode="decimal"
                    placeholder="10.000"
                  />
                </div>
                <div>
                  <label htmlFor="product_type" className="mb-1 block text-sm font-medium">
                    {m.productType}
                  </label>
                  <select
                    id="product_type"
                    name="product_type"
                    required
                    value={newCategoryId}
                    onChange={(event) => {
                      const nextId = event.currentTarget.value;
                      setNewCategoryId(nextId);
                      setNewSubcategoryId("");
                    }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2"
                  >
                    <option value="">
                      {lang === "ar"
                        ? "اختر الفئة"
                        : lang === "en"
                          ? "Choose a category"
                          : "Choisir une catégorie"}
                    </option>
                    {PRODUCT_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name[lang]}
                      </option>
                    ))}
                  </select>
                  <label
                    htmlFor="product_subcategory"
                    className="mb-1 mt-3 block text-sm font-medium"
                  >
                    {lang === "ar"
                      ? "التصنيف الفرعي"
                      : lang === "en"
                        ? "Subcategory"
                        : "Sous-catégorie"}
                  </label>
                  <select
                    id="product_subcategory"
                    name="product_subcategory"
                    required
                    value={newSubcategoryId}
                    onChange={(event) => setNewSubcategoryId(event.currentTarget.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2"
                  >
                    <option value="">
                      {lang === "ar"
                        ? "اختر التصنيف الفرعي"
                        : lang === "en"
                          ? "Choose a subcategory"
                          : "Choisir une sous-catégorie"}
                    </option>
                    {(getCategory(newCategoryId)?.subcategories ?? []).map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.id}>
                        {subcategory.name[lang]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                <label htmlFor="product_image" className="mb-1 block text-sm font-medium">
                  {m.productCover}
                </label>
                <input
                  id="product_image"
                  name="product_image"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    setCoverPreview(file ? URL.createObjectURL(file) : null);
                  }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                {coverPreview && (
                  <img
                    src={coverPreview}
                    alt={m.productCover}
                    className="h-32 w-44 rounded-lg object-cover"
                  />
                )}
                <label htmlFor="product_gallery" className="block text-sm font-medium">
                  {m.productGallery}
                </label>
                <input
                  id="product_gallery"
                  name="product_gallery"
                  type="file"
                  multiple
                  accept={IMAGE_ACCEPT}
                  onChange={(e) => {
                    setGalleryPreviews(
                      Array.from(e.currentTarget.files ?? []).map((file) =>
                        URL.createObjectURL(file),
                      ),
                    );
                  }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                {galleryPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {galleryPreviews.map((src, index) => (
                      <img
                        key={src}
                        src={src}
                        alt={`${m.productGallery} ${index + 1}`}
                        className="h-20 w-24 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{m.imageLimit}</p>
              </div>
              <div>
                <label htmlFor="digital_files" className="mb-1 block text-sm font-medium">
                  {m.digitalFiles}
                </label>
                <input
                  id="digital_files"
                  name="digital_files"
                  type="file"
                  multiple
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">{m.fileLimit}</p>
                {uploadProgress !== null && (
                  <div className="mt-2 space-y-1" role="status" aria-live="polite">
                    <div className="flex justify-between text-xs">
                      <span>
                        {lang === "ar"
                          ? "جارٍ رفع الملف"
                          : lang === "en"
                            ? "Uploading file"
                            : "Téléversement du fichier"}
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <progress className="h-2 w-full" value={uploadProgress} max={100} />
                  </div>
                )}
              </div>
              <SubmitButton busy={busy} label={m.upload} busyLabel={m.publishing} />
            </form>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold">{m.products}</h2>
            {productsQuery.isPending ? (
              <p>{m.loading}</p>
            ) : productsQuery.isError ? (
              <p role="alert">{m.error}</p>
            ) : !productsQuery.data?.length ? (
              <p className="rounded-xl bg-secondary p-5 text-sm">{m.noProducts}</p>
            ) : (
              <div className="space-y-3">
                {productsQuery.data.map((product) => (
                  <article key={product.id} className="rounded-xl border border-border p-4">
                    {product.deleted_at ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">{m.productDeleted}</p>
                        <SellerFileVersions productId={product.id} labels={m} allowArchiveLast />
                      </div>
                    ) : editing === product.id ? (
                      <form onSubmit={(e) => saveProduct(e, product)} className="space-y-3">
                        <Field
                          id={`edit_name_${product.id}`}
                          label={m.productName}
                          defaultValue={product.name}
                          required
                          maxLength={180}
                        />
                        <div>
                          <label
                            htmlFor={`edit_description_${product.id}`}
                            className="mb-1 block text-sm font-medium"
                          >
                            {m.description}
                          </label>
                          <textarea
                            id={`edit_description_${product.id}`}
                            name={`edit_description_${product.id}`}
                            defaultValue={product.description}
                            rows={3}
                            required
                            className="w-full rounded-lg border border-input bg-background px-3 py-2"
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {m.automaticTranslation}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Field
                            id={`edit_price_${product.id}`}
                            label={m.price}
                            defaultValue={(product.price_millimes / 1000).toFixed(3)}
                            required
                          />
                          <Field
                            id={`edit_sale_price_${product.id}`}
                            label={m.salePriceOptional}
                            defaultValue={
                              product.sale_price_millimes
                                ? (product.sale_price_millimes / 1000).toFixed(3)
                                : ""
                            }
                          />
                        </div>
                        <label
                          className="block text-sm font-medium"
                          htmlFor={`edit_type_${product.id}`}
                        >
                          {m.productType}
                        </label>
                        <select
                          id={`edit_type_${product.id}`}
                          name={`edit_type_${product.id}`}
                          required
                          value={editCategoryId}
                          onChange={(event) => {
                            const nextId = event.currentTarget.value;
                            setEditCategoryId(nextId);
                            setEditSubcategoryId("");
                          }}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        >
                          <option value="">
                            {lang === "ar"
                              ? "اختر الفئة"
                              : lang === "en"
                                ? "Choose a category"
                                : "Choisir une catégorie"}
                          </option>
                          {PRODUCT_CATEGORIES.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name[lang]}
                            </option>
                          ))}
                        </select>
                        <label
                          className="block text-sm font-medium"
                          htmlFor={`edit_subcategory_${product.id}`}
                        >
                          {lang === "ar"
                            ? "التصنيف الفرعي"
                            : lang === "en"
                              ? "Subcategory"
                              : "Sous-catégorie"}
                        </label>
                        <select
                          id={`edit_subcategory_${product.id}`}
                          name={`edit_subcategory_${product.id}`}
                          required
                          value={editSubcategoryId}
                          onChange={(event) => setEditSubcategoryId(event.currentTarget.value)}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        >
                          <option value="">
                            {lang === "ar"
                              ? "اختر التصنيف الفرعي"
                              : lang === "en"
                                ? "Choose a subcategory"
                                : "Choisir une sous-catégorie"}
                          </option>
                          {(getCategory(editCategoryId)?.subcategories ?? []).map((subcategory) => (
                            <option key={subcategory.id} value={subcategory.id}>
                              {subcategory.name[lang]}
                            </option>
                          ))}
                        </select>
                        <SellerImageFields product={product} labels={m} />
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold"
                          >
                            {m.save}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded-full border border-border px-4 py-2 text-sm"
                          >
                            {m.cancel ?? "×"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {product.image_path && (
                            <img
                              src={
                                supabase.storage
                                  .from("product-images")
                                  .getPublicUrl(product.image_path).data.publicUrl
                              }
                              alt={product.name}
                              className="mb-3 h-24 w-32 rounded-lg object-cover"
                            />
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{product.name}</h3>
                            <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                              {product.is_active ? m.active : m.draft}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {product.description}
                          </p>
                          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
                            {product.sale_price_millimes ? (
                              <>
                                <span className="text-xs font-bold text-red-600">PROMO</span>
                                <span className="text-muted-foreground line-through">
                                  {formatTND(product.price_millimes)}
                                </span>
                                <span className="text-red-600">
                                  {formatTND(product.sale_price_millimes)}
                                </span>
                                <TndEquivalents
                                  millimes={product.sale_price_millimes}
                                  locale={
                                    lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR"
                                  }
                                />
                              </>
                            ) : (
                              <>
                                {formatTND(product.price_millimes)}
                                <TndEquivalents
                                  millimes={product.price_millimes}
                                  locale={
                                    lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR"
                                  }
                                />
                              </>
                            )}
                          </p>
                        </div>
                        <SellerFileVersions
                          productId={product.id}
                          labels={m}
                          allowArchiveLast={!product.is_active}
                        />
                        <div className="flex flex-wrap gap-2">
                          <label className="cursor-pointer rounded-full border border-border px-3 py-2 text-xs font-semibold">
                            {m.addFiles}
                            <input
                              type="file"
                              multiple
                              className="sr-only"
                              disabled={busy}
                              onChange={(e) => {
                                const files = Array.from(e.currentTarget.files ?? []);
                                e.currentTarget.value = "";
                                void addFilesToProduct(product, files);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(product.id);
                              setEditCategoryId(
                                getCategory(product.product_type) ? product.product_type : "",
                              );
                              setEditSubcategoryId(product.product_subcategory ?? "");
                            }}
                            className="rounded-full border border-border px-3 py-2 text-xs font-semibold"
                          >
                            {m.editProduct}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleProduct(product)}
                            className="rounded-full bg-secondary px-3 py-2 text-xs font-semibold"
                          >
                            {product.is_active ? m.pause : m.publish}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteProduct(product)}
                            className="rounded-full border border-destructive px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
                          >
                            {m.deleteProduct}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-border p-5">
            <div>
              <h2 className="text-xl font-bold">{m.payoutMethod}</h2>
              <p className="mt-2 font-semibold">{m.weeklyManual}</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{m.payoutHelp}</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {m.payoutExternalFeesNote}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {lang === "ar"
                  ? "لا تُدخل كلمة مرور أو رمز OTP أو رمز PIN أو أي مفتاح سري."
                  : lang === "en"
                    ? "Never enter a password, OTP, PIN, or secret key."
                    : "Ne saisissez jamais de mot de passe, code OTP, code PIN ou clé secrète."}
              </p>
              <form
                key={payoutPreferenceQuery.data?.updated_at ?? "new-payout-preference"}
                onSubmit={(e) => void savePayoutPreference(e)}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="payout_method" value="bank_transfer" />
                <p className="rounded-lg bg-secondary/60 p-3 text-sm font-medium">
                  {lang === "ar"
                    ? "وسيلة الاستلام المتاحة حاليًا: التحويل البنكي"
                    : lang === "en"
                      ? "Currently available payout method: Bank transfer"
                      : "Moyen de versement actuellement disponible : virement bancaire"}
                </p>
                <label className="block text-sm font-medium">
                  {lang === "ar"
                    ? "اسم صاحب الحساب"
                    : lang === "en"
                      ? "Account holder name"
                      : "Titulaire du compte"}
                  <input
                    name="account_holder_name"
                    required
                    maxLength={160}
                    defaultValue={payoutPreferenceQuery.data?.account_holder_name ?? ""}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {lang === "ar"
                    ? "رقم الحساب البنكي أو IBAN"
                    : lang === "en"
                      ? "Bank account number or IBAN"
                      : "Numéro de compte bancaire ou IBAN"}
                  <input
                    name="account_identifier"
                    required
                    maxLength={200}
                    placeholder={
                      lang === "ar"
                        ? "رقم الحساب أو IBAN"
                        : lang === "en"
                          ? "Account number or IBAN"
                          : "Numéro de compte ou IBAN"
                    }
                    defaultValue={payoutPreferenceQuery.data?.account_identifier ?? ""}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                  />
                </label>
                {payoutMethod === "bank_transfer" && (
                  <label className="block text-sm font-medium">
                    {lang === "ar" ? "اسم البنك" : lang === "en" ? "Bank name" : "Nom de la banque"}
                    <input
                      name="bank_name"
                      required
                      maxLength={160}
                      defaultValue={payoutPreferenceQuery.data?.bank_name ?? ""}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                    />
                  </label>
                )}
                <label className="block text-sm font-medium">
                  {lang === "ar"
                    ? "معلومات إضافية (اختياري)"
                    : lang === "en"
                      ? "Additional details (optional)"
                      : "Informations complémentaires (facultatif)"}
                  <textarea
                    name="additional_details"
                    maxLength={500}
                    rows={2}
                    defaultValue={payoutPreferenceQuery.data?.additional_details ?? ""}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {m.save}
                </button>
              </form>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {lang === "ar"
                  ? "يمكن إضافة وسائل استلام أخرى مستقبلًا؛ أما الدفعات التي أُنشئت فتحفظ نسخة ثابتة من بياناتها."
                  : lang === "en"
                    ? "You can update your method for future payouts; each created payout keeps its own fixed destination snapshot."
                    : "Vous pouvez modifier le moyen pour les prochains versements ; chaque versement créé conserve son propre instantané de destination."}
              </p>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold">{m.payoutBalanceTitle}</h3>
              {sellerEarningsQuery.isPending || sellerPayoutBalancesQuery.isPending ? (
                <p className="mt-2 text-sm">{m.loading}</p>
              ) : sellerEarningsQuery.isError || sellerPayoutBalancesQuery.isError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {m.error}
                </p>
              ) : (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg bg-secondary p-3">
                      <p className="text-xs text-muted-foreground">{m.payoutEarned}</p>
                      <p className="mt-1 text-lg font-bold">{formatTND(sellerEarned)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary p-3">
                      <p className="text-xs text-muted-foreground">{m.payoutTransferred}</p>
                      <p className="mt-1 text-lg font-bold">
                        {formatTND(sellerPayoutTotals.transferred)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary p-3">
                      <p className="text-xs text-muted-foreground">{m.payoutReserved}</p>
                      <p className="mt-1 text-lg font-bold">
                        {formatTND(sellerPayoutTotals.reserved)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary p-3">
                      <p className="text-xs text-muted-foreground">{m.payoutAvailable}</p>
                      <p className="mt-1 text-lg font-bold">{formatTND(sellerAvailable)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {m.payoutBalanceNote}
                  </p>
                </>
              )}
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold">{m.payoutHistory}</h3>
              {payoutHistoryQuery.isPending ? (
                <p className="mt-2 text-sm">{m.loading}</p>
              ) : payoutHistoryQuery.isError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {m.error}
                </p>
              ) : !payoutHistoryQuery.data?.length ? (
                <p className="mt-2 rounded-lg bg-secondary p-3 text-sm">{m.noPayouts}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {payoutHistoryQuery.data.map((p) => (
                    <article
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/60 p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {p.status === "paid"
                            ? m.payoutPaid
                            : p.status === "processing"
                              ? m.payoutProcessing
                              : p.status === "failed"
                                ? m.payoutFailed
                                : p.status === "cancelled"
                                  ? m.payoutCancelled
                                  : m.payoutPending}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.paid_at ?? p.created_at).toLocaleDateString(locale)}
                        </p>
                        {p.provider_transfer_ref && (
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            {m.transferReference}: {p.provider_transfer_ref}
                          </p>
                        )}
                        {p.payout_destination_method && (
                          <p className="text-xs text-muted-foreground">
                            {lang === "ar"
                              ? "وسيلة الاستلام"
                              : lang === "en"
                                ? "Receiving method"
                                : "Moyen de réception"}
                            : {p.payout_destination_method}
                          </p>
                        )}
                      </div>
                      <div className="text-end space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {lang === "ar"
                            ? "مستحقاتك قبل رسوم التحويل"
                            : lang === "en"
                              ? "Seller payable before transfer fees"
                              : "Montant dû avant frais de transfert"}
                          :{" "}
                          {formatTND(
                            Number(p.seller_amount_millimes) +
                              Number(p.external_fees_millimes ?? 0),
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lang === "ar" ? "الرسوم" : lang === "en" ? "Fees" : "Frais"}:{" "}
                          {formatTND(Number(p.external_fees_millimes ?? 0))}
                        </p>
                        <strong>{formatTND(p.seller_amount_millimes)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold">{m.orders}</h2>
            {ordersQuery.isPending ? (
              <p>{m.loading}</p>
            ) : ordersQuery.isError ? (
              <p role="alert">{m.error}</p>
            ) : !sortedOrders.length ? (
              <p className="rounded-xl bg-secondary p-5 text-sm">{m.noOrders}</p>
            ) : (
              <div className="space-y-3">
                {sortedOrders.map((item) => (
                  <article key={item.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{item.product_name}</strong>
                      <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                        {m[item.orders?.status as keyof typeof m] ?? item.orders?.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      #{item.order_id.slice(0, 8)} ·{" "}
                      {item.orders?.created_at
                        ? new Date(item.orders.created_at).toLocaleDateString(locale)
                        : ""}{" "}
                      · ×{item.quantity}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-muted-foreground">{m.sales}</p>
                        <strong>{formatTND(item.gross_millimes ?? 0)}</strong>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{m.commission}</p>
                        <strong>{formatTND(item.commission_millimes ?? 0)}</strong>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{m.sellerNet}</p>
                        <strong>{formatTND(item.seller_net_millimes ?? 0)}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{m.tndNote}</p>
          </section>
        </div>
      )}
    </AuthShell>
  );
}

function SellerImageFields({
  product,
  labels: m,
}: {
  product: Product;
  labels: ReturnType<typeof useLang>["t"]["marketplace"];
}) {
  const gallery = useQuery({
    queryKey: ["seller-product-gallery", product.id],
    queryFn: () => loadProductGallery(product.id),
  });
  return (
    <div className="space-y-3">
      <label htmlFor={`edit_cover_${product.id}`} className="block text-sm font-medium">
        {m.productCover}
      </label>
      <div className="flex h-32 w-44 items-center justify-center overflow-hidden rounded-lg bg-cream-light">
        <ProductPreview path={product.image_path} alt={product.name} />
      </div>
      <input
        id={`edit_cover_${product.id}`}
        name={`edit_cover_${product.id}`}
        type="file"
        accept={IMAGE_ACCEPT}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />
      <label htmlFor={`edit_gallery_${product.id}`} className="block text-sm font-medium">
        {m.productGallery}
      </label>
      {gallery.isError && <p role="alert">{m.error}</p>}
      {gallery.data?.available === false && <p role="status">{m.previewSetupRequired}</p>}
      <div className="flex flex-wrap gap-2">
        {gallery.data?.images.map((image) => (
          <div
            key={image.id}
            className="flex h-20 w-24 items-center justify-center overflow-hidden rounded-lg bg-cream-light"
          >
            <ProductPreview path={image.image_path} alt={product.name} />
          </div>
        ))}
      </div>
      <input
        id={`edit_gallery_${product.id}`}
        name={`edit_gallery_${product.id}`}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        disabled={!gallery.data?.available}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />
      <p className="text-xs text-muted-foreground">{m.imageLimit}</p>
    </div>
  );
}

function SellerFileVersions({
  productId,
  labels: m,
  allowArchiveLast = false,
}: {
  productId: string;
  labels: ReturnType<typeof useLang>["t"]["marketplace"];
  allowArchiveLast?: boolean;
}) {
  const qc = useQueryClient();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const versionsQuery = useQuery({
    queryKey: ["seller-file-versions", productId],
    queryFn: async () => listSellerFileVersions({ data: { productId } }),
  });

  async function archive(versionId: string) {
    if (workingId) return;
    setWorkingId(versionId);
    setMessage("");
    try {
      const { error } = await archiveSellerFileVersion({ data: { versionId } });
      if (error) {
        setMessage(m.fileArchiveFailed);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["seller-file-versions", productId] });
    } catch {
      setMessage(m.fileArchiveFailed);
    } finally {
      setWorkingId(null);
    }
  }

  async function remove(versionId: string, fileName: string, sizeBytes: number) {
    if (
      workingId ||
      !window.confirm(m.confirmDeleteFile + "\n\n" + fileName + " · " + formatFileSize(sizeBytes))
    ) {
      return;
    }
    setWorkingId(versionId);
    setMessage("");
    try {
      const result = await deleteSellerFileVersion({ data: { versionId } });
      if (result.error) {
        setMessage(
          result.error.message === "file_version_has_purchases"
            ? m.fileDeletePurchased
            : result.error.message === "file_last_active_version"
              ? m.fileDeleteLastActive
              : result.error.message === "storage_deleted_audit_failed"
                ? m.fileDeletedAuditFailed
                : result.error.message === "file_upload_in_progress"
                  ? m.fileUploadInProgress
                  : m.fileDeleteFailed,
        );
        if (result.data) {
          await qc.invalidateQueries({ queryKey: ["seller-file-versions", productId] });
        }
        return;
      }
      setMessage(result.data?.deletedBytes ? m.fileDeleted : m.fileDeletedNoStorage);
      await qc.invalidateQueries({ queryKey: ["seller-file-versions", productId] });
    } catch {
      setMessage(m.fileDeleteFailed);
    } finally {
      setWorkingId(null);
    }
  }

  if (versionsQuery.isPending) {
    return <p className="text-xs text-muted-foreground">{m.loading}</p>;
  }
  if (versionsQuery.isError) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {m.error}
      </p>
    );
  }

  const versions = versionsQuery.data ?? [];
  const activeCount = versions.filter((version) => version.status === "active").length;
  if (!versions.length) return null;

  return (
    <div className="w-full space-y-2 rounded-lg bg-secondary/40 p-3">
      <h3 className="text-sm font-semibold">{m.fileVersions}</h3>
      {versions.map((version) => (
        <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p className="break-all font-medium">{version.file_name}</p>
            <p className="text-muted-foreground">
              {version.status === "active"
                ? m.fileStatusActive
                : version.status === "archived"
                  ? m.fileStatusArchived
                  : m.fileStatusPending}
              {" · "}
              {m.fileSize}: {formatFileSize(Number(version.size_bytes))}
            </p>
          </div>
          <div className="flex gap-2">
            {version.status === "active" && (activeCount > 1 || allowArchiveLast) && (
              <button
                type="button"
                disabled={workingId !== null}
                onClick={() => void archive(version.id)}
                className="rounded-full border border-border px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                {workingId === version.id ? m.loading : m.archiveFile}
              </button>
            )}
            <button
              type="button"
              disabled={workingId !== null}
              onClick={() => void remove(version.id, version.file_name, Number(version.size_bytes))}
              className="rounded-full border border-destructive px-3 py-1.5 font-semibold text-destructive disabled:opacity-50"
            >
              {workingId === version.id ? m.loading : m.deleteFile}
            </button>
          </div>
        </div>
      ))}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
