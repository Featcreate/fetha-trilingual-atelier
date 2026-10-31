import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/AuthShell";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({ meta: [{ title: "Espace vendeur — Algorea Bazaar" }, { name: "robots", content: "noindex" }] }),
  component: SellerDashboard,
});

const text = {
  fr: {
    title:"Espace vendeur", subtitle:"Gérez votre boutique, vos produits et vos revenus.", back:"Mon compte",
    store:"Ma boutique", createStore:"Créer ma boutique", storeName:"Nom de la boutique", slug:"Adresse de la boutique",
    create:"Créer gratuitement", noStore:"Vous n'avez pas encore de boutique.", emailRequired:"Confirmez votre adresse e-mail avant de créer votre boutique.",
    products:"Produits", addProduct:"Ajouter un produit", name:"Nom du produit", description:"Description", type:"Type",
    price:"Prix (TND)", file:"Fichier numérique (50 Mo maximum)", save:"Enregistrer le produit", upload:"Téléverser",
    loading:"Chargement…", error:"Une erreur est survenue. Vérifiez les champs et réessayez.", success:"Enregistré avec succès.",
    active:"Active", suspended:"Suspendue", listed:"Publié", draft:"Brouillon", recent:"Produits récents",
    payout:"Réception des revenus", weekly:"Virement manuel hebdomadaire", payoutNote:"Algorea retient sa commission de 5 %. Le montant restant vous est versé manuellement chaque semaine. Les frais externes éventuels sont distincts.",
    netSales:"Ventes nettes enregistrées", salesNote:"Montants du registre vendeur, pas un solde immédiatement disponible.", recentSales:"Dernières ventes",
    noProducts:"Aucun produit pour le moment.", noSales:"Aucune vente enregistrée.", product:"Produit", status:"Statut", date:"Date",
    currency:"TND", fileTooLarge:"Le fichier dépasse 50 Mo.", chooseFile:"Choisissez un fichier.", onlyManual:"Le versement automatique n'est pas activé.",
  },
  ar: {
    title:"مساحة البائع", subtitle:"أدر متجرك ومنتجاتك ومستحقاتك.", back:"حسابي",
    store:"متجري", createStore:"إنشاء متجري", storeName:"اسم المتجر", slug:"رابط المتجر",
    create:"إنشاء مجاني", noStore:"ليس لديك متجر بعد.", emailRequired:"يرجى تأكيد بريدك الإلكتروني قبل إنشاء المتجر.",
    products:"المنتجات", addProduct:"إضافة منتج", name:"اسم المنتج", description:"الوصف", type:"النوع",
    price:"السعر (د.ت)", file:"الملف الرقمي (50 ميغابايت كحد أقصى)", save:"حفظ المنتج", upload:"رفع",
    loading:"جارٍ التحميل…", error:"حدث خطأ. تحقق من البيانات وحاول مجدداً.", success:"تم الحفظ بنجاح.",
    active:"نشط", suspended:"معلّق", listed:"منشور", draft:"مسودة", recent:"أحدث المنتجات",
    payout:"استلام المستحقات", weekly:"تحويل يدوي أسبوعي", payoutNote:"تقتطع Algorea عمولتها 5%، ثم تحوّل إليك المنصة المبلغ المتبقي يدوياً كل أسبوع. أي رسوم خارجية منفصلة.",
    netSales:"صافي المبيعات المسجّل", salesNote:"المبالغ المسجلة في دفتر البائع، وليست رصيداً متاحاً فوراً.", recentSales:"آخر المبيعات",
    noProducts:"لا توجد منتجات حالياً.", noSales:"لا توجد مبيعات مسجلة.", product:"المنتج", status:"الحالة", date:"التاريخ",
    currency:"د.ت", fileTooLarge:"حجم الملف يتجاوز 50 ميغابايت.", chooseFile:"اختر ملفاً.", onlyManual:"التحويل الآلي غير مفعّل.",
  },
  en: {
    title:"Seller dashboard", subtitle:"Manage your store, products and earnings.", back:"My account",
    store:"My store", createStore:"Create my store", storeName:"Store name", slug:"Store address",
    create:"Create for free", noStore:"You do not have a store yet.", emailRequired:"Confirm your email address before creating a store.",
    products:"Products", addProduct:"Add a product", name:"Product name", description:"Description", type:"Type",
    price:"Price (TND)", file:"Digital file (50 MB maximum)", save:"Save product", upload:"Upload",
    loading:"Loading…", error:"Something went wrong. Check the fields and try again.", success:"Saved successfully.",
    active:"Active", suspended:"Suspended", listed:"Published", draft:"Draft", recent:"Recent products",
    payout:"Receive earnings", weekly:"Weekly manual transfer", payoutNote:"Algorea retains its 5% commission. The remaining amount is transferred manually each week. Any external fees are separate.",
    netSales:"Recorded net sales", salesNote:"Seller ledger amounts, not an immediately withdrawable balance.", recentSales:"Recent sales",
    noProducts:"No products yet.", noSales:"No sales recorded.", product:"Product", status:"Status", date:"Date",
    currency:"TND", fileTooLarge:"File exceeds 50 MB.", chooseFile:"Choose a file.", onlyManual:"Automatic payouts are not enabled.",
  },
} as const;

const productTypes = ["ebook","pdf","template","educational","bundle","software","app"] as const;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

function makeSlug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}
function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 200);
}

function SellerDashboard() {
  const { lang, setLang } = useLang();
  const t = text[lang];
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [productType, setProductType] = useState<(typeof productTypes)[number]>("pdf");
  const [price, setPrice] = useState("10");

  const storeQuery = useQuery({
    queryKey:["seller-store",user.id],
    queryFn:async()=>{
      const {data,error}=await supabase.from("stores").select("id,name,slug,status,created_at").eq("owner_id",user.id).maybeSingle();
      if(error) throw error; return data;
    },
  });
  const store = storeQuery.data;
  const productsQuery = useQuery({
    queryKey:["seller-products",store?.id], enabled:Boolean(store?.id),
    queryFn:async()=>{
      const {data,error}=await supabase.from("products").select("id,name,product_type,price_millimes,is_active,created_at")
        .eq("store_id",store!.id).order("created_at",{ascending:false});
      if(error) throw error; return data??[];
    },
  });
  const ledgerQuery = useQuery({
    queryKey:["seller-ledger",user.id],
    queryFn:async()=>{
      const {data,error}=await supabase.from("seller_ledger_entries").select("id,amount_millimes,created_at,entry_type")
        .eq("seller_id",user.id).order("created_at",{ascending:false}).limit(10);
      if(error) throw error; return data??[];
    },
  });
  const preferenceQuery = useQuery({
    queryKey:["seller-payout-preference",store?.id],enabled:Boolean(store?.id),
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("seller_payout_preferences").select("id,method,konnect_wallet_id")
        .eq("store_id",store!.id).maybeSingle();
      if(error) throw error; return data;
    },
  });

  async function createStore(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); setNotice("");
    if(!user.email_confirmed_at){setFormError(t.emailRequired);return;}
    const f=new FormData(event.currentTarget);
    const name=String(f.get("store_name")??"").trim();
    const slug=makeSlug(String(f.get("store_slug")||name));
    if(name.length<2||name.length>120||slug.length<3){setFormError(t.error);return;}
    setBusy(true);
    const {error}=await supabase.from("stores").insert({owner_id:user.id,name,slug,status:"active"});
    setBusy(false);
    if(error){setFormError(error.code==="23505"?"Cette adresse de boutique est déjà utilisée.":t.error);return;}
    await queryClient.invalidateQueries({queryKey:["seller-store",user.id]}); setNotice(t.success);
  }

  async function saveProduct(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); setNotice("");
    if(!store){return;}
    const numericPrice=Number(price.replace(",","."));
    if(!productName.trim()||productName.trim().length>160||!Number.isFinite(numericPrice)||numericPrice<0){setFormError(t.error);return;}
    const file=fileRef.current?.files?.[0];
    if(file&&file.size>MAX_FILE_BYTES){setFormError(t.fileTooLarge);return;}
    if(file&&file.size===0){setFormError(t.error);return;}
    setBusy(true);
    const {data:product,error:productError}=await supabase.from("products").insert({
      store_id:store.id,name:productName.trim(),description:description.trim(),product_type:productType,
      price_millimes:Math.round(numericPrice*1000),is_active:false,
    }).select("id").single();
    if(productError||!product){setBusy(false);setFormError(t.error);return;}
    if(file){
      const cleanName=safeFileName(file.name);
      const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
      const sha=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
      const {data:registered,error:registerError}=await supabase.rpc("register_file_version",{
        _product_id:product.id,_file_name:cleanName,_size_bytes:file.size,_mime_type:file.type||"application/octet-stream",_sha256:sha,
      });
      const registration=registered?.[0];
      if(registerError||!registration){setBusy(false);setFormError(t.error);return;}
      const {error:uploadError}=await supabase.storage.from("product-files").upload(registration.upload_path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
      if(uploadError){setBusy(false);setFormError(t.error);return;}
      const {error:activateError}=await supabase.rpc("activate_file_version",{_version_id:registration.version_id});
      if(activateError){setBusy(false);setFormError(t.error);return;}
    }
    setBusy(false);setProductName("");setDescription("");setPrice("10");
    if(fileRef.current)fileRef.current.value="";
    await queryClient.invalidateQueries({queryKey:["seller-products",store.id]});setNotice(t.success);
  }

  const money=(millimes:number)=>new Intl.NumberFormat(lang==="ar"?"ar-TN":lang==="en"?"en-GB":"fr-FR",{style:"currency",currency:"TND"}).format(millimes/1000);
  const date=(value:string)=>new Date(value).toLocaleDateString(lang==="ar"?"ar-TN":lang==="en"?"en-GB":"fr-FR");
  const netSales=(ledgerQuery.data??[]).reduce((sum,row)=>sum+row.amount_millimes,0);

  return <AuthShell lang={lang} setLang={setLang} title={t.title} wide>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      <Link to="/account" className="text-sm font-semibold text-coral hover:underline">{t.back}</Link>
    </div>
    {(storeQuery.isPending||ledgerQuery.isPending)?<p className="py-8 text-center">{t.loading}</p>:storeQuery.isError||ledgerQuery.isError?<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{t.error}</p>:!store?(
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold">{t.createStore}</h2><p className="mt-2 text-sm text-muted-foreground">{t.noStore}</p>
        <form onSubmit={createStore} className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm font-medium">{t.storeName}<input name="store_name" required minLength={2} maxLength={120} className="rounded-xl border border-border bg-background px-3 py-3"/></label>
          <label className="grid gap-1 text-sm font-medium">{t.slug}<input name="store_slug" placeholder="ma-boutique" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={50} className="rounded-xl border border-border bg-background px-3 py-3" /></label>
          {formError&&<p role="alert" className="text-sm text-destructive">{formError}</p>}
          <button disabled={busy} className="rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy?t.loading:t.create}</button>
        </form>
      </section>
    ):(
      <>
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{t.store}</p><h2 className="mt-1 text-xl font-bold">{store.name}</h2><p dir="ltr" className="text-sm text-muted-foreground">/{store.slug}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-sm">{store.status==="active"?t.active:t.suspended}</span></div>
        </section>
        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t.products}</p><p className="mt-2 text-3xl font-bold">{productsQuery.data?.length??0}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{t.netSales}</p><p className="mt-2 text-3xl font-bold">{money(netSales)}</p><p className="mt-2 text-xs text-muted-foreground">{t.salesNote}</p></div>
        </section>
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">{t.addProduct}</h2>
          <form onSubmit={saveProduct} className="mt-4 grid gap-4">
            <label className="grid gap-1 text-sm font-medium">{t.name}<input value={productName} onChange={e=>setProductName(e.target.value)} required maxLength={160} className="rounded-xl border border-border bg-background px-3 py-3"/></label>
            <label className="grid gap-1 text-sm font-medium">{t.description}<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={5000} rows={3} className="rounded-xl border border-border bg-background px-3 py-3"/></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">{t.type}<select value={productType} onChange={e=>setProductType(e.target.value as (typeof productTypes)[number])} className="rounded-xl border border-border bg-background px-3 py-3">{productTypes.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-medium">{t.price}<input type="number" min="0" step="0.001" value={price} onChange={e=>setPrice(e.target.value)} required className="rounded-xl border border-border bg-background px-3 py-3"/></label>
            </div>
            <label className="grid gap-1 text-sm font-medium">{t.file}<input ref={fileRef} type="file" className="rounded-xl border border-border bg-background px-3 py-3" /></label>
            <p className="text-xs text-muted-foreground">ZIP, PDF, images and common digital formats. Maximum 50 MB per file.</p>
            {formError&&<p role="alert" className="text-sm text-destructive">{formError}</p>}
            {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
            <button disabled={busy} className="rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy?t.loading:t.save}</button>
          </form>
        </section>
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">{t.payout}</h2><p className="mt-2 font-semibold">{t.weekly}</p><p className="mt-2 text-sm text-muted-foreground">{t.payoutNote}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t.onlyManual}</p>
          {preferenceQuery.data&&<p className="mt-2 text-xs text-muted-foreground">Preference: {preferenceQuery.data.method}</p>}
        </section>
        <section className="mt-6"><h2 className="mb-3 text-lg font-bold">{t.recent}</h2>
          {productsQuery.isPending?<p>{t.loading}</p>:!productsQuery.data?.length?<p className="rounded-xl bg-secondary p-4 text-sm">{t.noProducts}</p>:<div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[480px] text-sm"><thead className="bg-secondary"><tr><th className="p-3 text-start">{t.product}</th><th className="p-3 text-start">{t.type}</th><th className="p-3 text-start">{t.price}</th><th className="p-3 text-start">{t.status}</th></tr></thead><tbody>{productsQuery.data.slice(0,10).map(p=><tr key={p.id} className="border-t border-border"><td className="p-3">{p.name}</td><td className="p-3">{p.product_type}</td><td className="p-3">{money(p.price_millimes)}</td><td className="p-3">{p.is_active?t.listed:t.draft}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="mt-6"><h2 className="mb-3 text-lg font-bold">{t.recentSales}</h2>{!ledgerQuery.data?.length?<p className="rounded-xl bg-secondary p-4 text-sm">{t.noSales}</p>:<div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[340px] text-sm"><thead className="bg-secondary"><tr><th className="p-3 text-start">{t.date}</th><th className="p-3 text-end">{t.netSales}</th></tr></thead><tbody>{ledgerQuery.data.map(row=><tr key={row.id} className="border-t border-border"><td className="p-3">{date(row.created_at)}</td><td className="p-3 text-end">{money(row.amount_millimes)}</td></tr>)}</tbody></table></div>}</section>
      </>
    )}
  </AuthShell>;
}
