import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useLang } from "@/lib/i18n";
import { formatTND, parseTNDToMillimes } from "@/lib/money";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({
    meta: [{ title: "Espace vendeur — Algorea Bazaar" }, { name: "robots", content: "noindex" }],
  }),
  component: SellerPage,
});

type Store = Database["public"]["Tables"]["stores"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductType = Product["product_type"];
const productTypes: ProductType[] = [
  "ebook",
  "pdf",
  "template",
  "educational",
  "bundle",
  "software",
  "app",
  "printable",
  "planner",
  "course",
  "worksheets",
  "flashcards",
  "audio",
  "video",
  "graphics",
  "other",
];
const KONNECT_SELLER_REGISTRATION_URL = "https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

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
  const [editing, setEditing] = useState<string | null>(null);
  const [editingStore, setEditingStore] = useState(false);

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
        .select("id,method,konnect_wallet_id")
        .eq("store_id", store!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const payoutHistoryQuery = useQuery({
    queryKey: ["seller-payout-history", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_payouts")
        .select(
          "id,status,seller_amount_millimes,currency,created_at,paid_at,provider_transfer_ref",
        )
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function createStore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("store_name") ?? "").trim();
    const slug = slugify(String(form.get("store_slug") || name));
    if (!name) return setNotice(m.nameRequired);
    if (slug.length < 3) return setNotice(m.slugHint);
    setBusy(true);
    setNotice("");
    const { error } = await supabase
      .from("stores")
      .insert({ owner_id: user.id, name, slug, status: "active" });
    setBusy(false);
    if (error)
      return setNotice(
        error.message.includes("email_verification_required")
          ? m.emailVerificationRequired
          : error.code === "23505"
            ? m.slugHint
            : m.error,
      );
    setNotice(m.storeCreated);
    await qc.invalidateQueries({ queryKey: ["seller-store", user.id] });
  }

  async function savePayoutPreference() {
    if (!store) return;
    setBusy(true);
    setNotice("");
    const { error } = await supabase
      .from("seller_payout_preferences")
      .upsert({ store_id: store.id, method: "weekly_manual" }, { onConflict: "store_id" });
    setBusy(false);
    if (error) return setNotice(m.error);
    setNotice(m.productUpdated);
    await qc.invalidateQueries({ queryKey: ["seller-payout-preference", store.id] });
  }

  async function uploadFile(
    productId: string,
    file: File,
  ): Promise<"ok" | "quota" | "email" | "error"> {
    const fileName = safeFileName(file.name);
    const { data: versionRows, error: registerError } = await supabase.rpc(
      "register_file_version",
      {
        _product_id: productId,
        _file_name: fileName,
        _size_bytes: file.size,
        _mime_type: file.type || "application/octet-stream",
        _sha256: "",
      },
    );
    const version = Array.isArray(versionRows) ? versionRows[0] : versionRows;
    if (registerError) {
      if (registerError.message.includes("storage_quota_exceeded")) return "quota";
      if (registerError.message.includes("email_verification_required")) return "email";
      return "error";
    }
    if (!version?.upload_path || !version?.version_id) return "error";
    const { error: uploadError } = await supabase.storage
      .from("product-files")
      .upload(version.upload_path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) return "error";
    const { error: activateError } = await supabase.rpc("activate_file_version", {
      _version_id: version.version_id,
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
    const productType = String(values.get("product_type") ?? "other") as ProductType;
    const files = values
      .getAll("digital_files")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const imageValue = values.get("product_image");
    const imageFile =
      imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
    if (!name || !description) return setNotice(m.productRequired);
    if (!price) return setNotice(m.invalidPrice);
    if (!files.length || files.some((file) => file.size < 1 || file.size > MAX_FILE_BYTES))
      return setNotice(m.invalidFile);
    if (
      imageFile &&
      (imageFile.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES.has(imageFile.type))
    ) {
      return setNotice(m.invalidFile);
    }
    if (!productTypes.includes(productType)) return setNotice(m.error);
    setBusy(true);
    setNotice("");
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        store_id: store.id,
        name,
        description,
        price_millimes: price,
        product_type: productType,
        is_active: false,
      })
      .select("id")
      .single();
    if (productError || !product) {
      setBusy(false);
      return setNotice(m.error);
    }

    if (imageFile) {
      const imagePath = `${store.id}/${product.id}/${crypto.randomUUID()}-${safeFileName(imageFile.name)}`;
      const { error: imageUploadError } = await supabase.storage
        .from("product-images")
        .upload(imagePath, imageFile, {
          contentType: imageFile.type,
          upsert: false,
        });
      if (imageUploadError) {
        setBusy(false);
        return setNotice(m.fileUploadFailed);
      }
      const { error: imageSaveError } = await supabase
        .from("products")
        .update({ image_path: imagePath })
        .eq("id", product.id)
        .eq("store_id", store.id);
      if (imageSaveError) {
        setBusy(false);
        return setNotice(m.fileUploadFailed);
      }
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
    setNotice(m.productCreated);
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

  async function saveProduct(e: FormEvent<HTMLFormElement>, product: Product) {
    e.preventDefault();
    if (!store) return;
    const f = new FormData(e.currentTarget);
    const name = String(f.get(`edit_name_${product.id}`) ?? "").trim();
    const description = String(f.get(`edit_description_${product.id}`) ?? "").trim();
    const price = parseTNDToMillimes(String(f.get(`edit_price_${product.id}`) ?? ""));
    if (!name || !description) return setNotice(m.productRequired);
    if (!price) return setNotice(m.invalidPrice);
    const { error } = await supabase
      .from("products")
      .update({ name, description, price_millimes: price })
      .eq("id", product.id)
      .eq("store_id", store.id);
    if (error) return setNotice(m.error);
    setEditing(null);
    setNotice(m.productUpdated);
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
          <form onSubmit={createStore} className="mt-5 space-y-4">
            <Field id="store_name" name="store_name" label={m.storeName} required maxLength={120} />
            <Field
              id="store_slug"
              name="store_slug"
              label={m.storeSlug}
              placeholder="ma-boutique"
            />
            <p className="text-xs text-muted-foreground">{m.slugHint}</p>
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
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="price"
                  label={m.price}
                  required
                  inputMode="decimal"
                  placeholder="12.500"
                />
                <div>
                  <label htmlFor="product_type" className="mb-1 block text-sm font-medium">
                    {m.productType}
                  </label>
                  <select
                    id="product_type"
                    name="product_type"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2"
                  >
                    {productTypes.map((type) => (
                      <option key={type} value={type}>
                        {m[type]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="product_image" className="mb-1 block text-sm font-medium">
                  {m.productImage}
                </label>
                <input
                  id="product_image"
                  name="product_image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">{m.imageLimit}</p>
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
                    {editing === product.id ? (
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
                        </div>
                        <Field
                          id={`edit_price_${product.id}`}
                          label={m.price}
                          defaultValue={(product.price_millimes / 1000).toFixed(3)}
                          required
                        />
                        <div className="flex gap-2">
                          <button className="rounded-full bg-accent px-4 py-2 text-sm font-semibold">
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
                              src={supabase.storage.from("product-images").getPublicUrl(product.image_path).data.publicUrl}
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
                          <p className="mt-2 text-sm font-bold">
                            {formatTND(product.price_millimes)}
                          </p>
                        </div>
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
                            onClick={() => setEditing(product.id)}
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
              <a
                href={KONNECT_SELLER_REGISTRATION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {m.konnectRegister}
              </a>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{m.konnectEligibility}</p>
            </div>
            <button
              type="button"
              onClick={() => void savePayoutPreference()}
              disabled={busy}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {m.save}
            </button>
            <p className="text-xs text-muted-foreground">
              {payoutPreferenceQuery.data?.method ?? "weekly_manual"}
            </p>
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
                      </div>
                      <strong>{formatTND(p.seller_amount_millimes)}</strong>
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
