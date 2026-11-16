import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ShoppingCart, Trash2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { ProductPreview } from "@/components/ProductPreview";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { localizedProductText } from "@/lib/product-translations";

export const Route = createFileRoute("/cart")({ component: CartPage });

type Product = {
  id: string; name: string; price_millimes: number; sale_price_millimes: number | null;
  image_path: string | null; name_translations: unknown; store_id: string | null;
};
type Store = { id: string; name: string };
type PaymentMethod = { method_id: string; method_type: string; label: string; instructions: string };

const words = {
  fr: { title:"Panier par boutique", empty:"Votre panier est vide.", browse:"Continuer mes achats", total:"Total", remove:"Retirer", choose:"Choisissez la boutique dont vous souhaitez finaliser la commande.", checkout:"Créer la commande", working:"Création…", payment:"Instructions de paiement du vendeur", noMethods:"Le vendeur n’a pas encore renseigné ses moyens de paiement. La commande n’a pas été créée.", created:"Commande créée. Effectuez le paiement directement auprès du vendeur, puis attendez sa confirmation avant le téléchargement.", error:"Impossible de créer la commande. Vérifiez votre panier et réessayez.", limit:"Chaque boutique possède son propre panier, limité à 50 produits différents.", select:"Boutique", order:"Commande", close:"Fermer les instructions" },
  ar: { title:"سلة مستقلة لكل متجر", empty:"سلة مشترياتك فارغة.", browse:"متابعة التسوق", total:"الإجمالي", remove:"حذف", choose:"اختاري المتجر الذي تريدين إتمام الطلب منه.", checkout:"إنشاء الطلب", working:"جارٍ الإنشاء…", payment:"تعليمات الدفع الخاصة بالبائع", noMethods:"لم يضف البائع وسائل الدفع بعد. لم يتم إنشاء الطلب.", created:"تم إنشاء الطلب. ادفعي مباشرة للبائع وانتظري تأكيده قبل تنزيل المنتج.", error:"تعذر إنشاء الطلب. تحققي من السلة وحاولي مجدداً.", limit:"لكل متجر سلة مستقلة بحد أقصى 50 منتجاً مختلفاً.", select:"المتجر", order:"الطلب", close:"إغلاق التعليمات" },
  en: { title:"Separate store carts", empty:"Your cart is empty.", browse:"Continue shopping", total:"Total", remove:"Remove", choose:"Choose the store whose order you want to place.", checkout:"Create order", working:"Creating…", payment:"Seller payment instructions", noMethods:"The seller has not added payment methods yet. No order was created.", created:"Order created. Pay the seller directly and wait for their confirmation before downloading.", error:"Could not create the order. Check your cart and try again.", limit:"Each store has its own cart, limited to 50 different products.", select:"Store", order:"Order", close:"Close instructions" },
} as const;

function CartPage() {
  const { lang, setLang } = useLang();
  const t = words[lang];
  const { items, count, remove, clear, assignStore } = useCart();
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey:["cart-products", items.map(x=>x.productId).join(",")],
    enabled:items.length>0,
    queryFn:async()=>{
      const ids=items.map(x=>x.productId);
      const {data,error}=await supabase.from("products").select("id,name,name_translations,price_millimes,sale_price_millimes,image_path,store_id").in("id",ids).eq("is_active",true);
      if(error) throw error;
      const storeIds=[...new Set((data??[]).map(p=>p.store_id).filter((x):x is string=>!!x))];
      const {data:stores,error:storeError}=storeIds.length?await supabase.from("stores").select("id,name").in("id",storeIds).eq("status","active"):{data:[],error:null};
      if(storeError) throw storeError;
      return {products:(data??[]) as Product[],stores:(stores??[]) as Store[]};
    }
  });
  const productMap=useMemo(()=>new Map((query.data?.products??[]).map(p=>[p.id,p])),[query.data]);
  const storeMap=useMemo(()=>new Map((query.data?.stores??[]).map(s=>[s.id,s])),[query.data]);
  // Migrate legacy cart entries by resolving their store from the product record.
  for (const line of items) {
    const product=productMap.get(line.productId);
    if(!line.storeId && product?.store_id) assignStore(line.productId,product.store_id);
  }
  const groups=useMemo(()=>{
    const map=new Map<string,{store:Store;lines:Array<{product:Product;total:number}>}>();
    for(const line of items){
      const p=productMap.get(line.productId);
      const store=line.storeId?storeMap.get(line.storeId):undefined;
      if(!p||!store) continue;
      const group=map.get(store.id)??{store,lines:[]};
      group.lines.push({product:p,total:p.sale_price_millimes??p.price_millimes});
      map.set(store.id,group);
    }
    return [...map.values()];
  },[items,productMap,storeMap]);
  const selected=groups.find(g=>g.store.id===selectedStoreId)??groups[0];
  const total=selected?.lines.reduce((sum,line)=>sum+line.total,0)??0;
  const checkout=useMutation({
    mutationFn:async()=>{
      if(!selected) throw new Error("empty_cart");
      const checkoutKey=crypto.randomUUID();
      const {data,error}=await (supabase as any).rpc("create_order_from_cart",{
        _items:selected.lines.map(({product})=>({productId:product.id,quantity:1})),
        _checkout_key:checkoutKey
      });
      if(error) throw error;
      const id=data as string;
      const {data:paymentRows,error:paymentError}=await (supabase as any).rpc("get_order_payment_methods",{_order_id:id});
      if(paymentError) throw paymentError;
      return {id,methods:(paymentRows??[]) as PaymentMethod[]};
    },
    onSuccess:({id,methods})=>{
      setOrderId(id); setMethods(methods); setNotice(methods.length?t.created:t.noMethods);
      if(methods.length && selected) clear(selected.store.id);
    },
    onError:()=>setNotice(t.error)
  });

  return <AuthShell lang={lang} setLang={setLang} title={<span className="inline-flex items-center gap-2"><ShoppingCart className="h-6 w-6"/>{t.title}</span>} wide>
    <div className="mb-5 flex flex-wrap justify-between gap-3">
      <Link to="/catalog" className="text-sm font-semibold text-coral hover:underline">{t.browse}</Link>
      <span className="text-sm text-muted-foreground">{count}</span>
    </div>
    {items.length===0?<p className="rounded-xl bg-secondary p-5">{t.empty}</p>:query.isPending?<p>…</p>:query.isError?<p role="alert">{t.error}</p>:<>
      <p className="mb-3 text-sm text-muted-foreground">{t.choose}</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {groups.map(g=><button key={g.store.id} type="button" onClick={()=>{setSelectedStoreId(g.store.id);setOrderId(null);setNotice("");}} className={`rounded-full border px-4 py-2 text-sm font-semibold ${(selected?.store.id===g.store.id)?"border-coral bg-coral/10":"border-border"}`}>{g.store.name} ({g.lines.length})</button>)}
      </div>
      {!selected?<p className="rounded-xl bg-secondary p-4">{t.error}</p>:<>
        <h2 className="mb-3 text-lg font-bold">{selected.store.name}</h2>
        <div className="space-y-3">
          {selected.lines.map(({product,total})=><article key={product.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3">
            <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-cream-light"><ProductPreview path={product.image_path} alt={product.name}/></div>
            <div className="min-w-0 flex-1"><p className="font-bold">{localizedProductText(product.name,product.name_translations,lang)}</p><p className="font-semibold">{formatTND(total)}</p></div>
            <button type="button" onClick={()=>remove(product.id)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><Trash2 className="h-4 w-4"/>{t.remove}</button>
          </article>)}
        </div>
        <div className="mt-6 rounded-xl border border-border p-5">
          <div className="flex justify-between text-lg font-extrabold"><span>{t.total}</span><span>{formatTND(total)}</span></div>
          <p className="mt-2 text-xs text-muted-foreground">{t.limit}</p>
          <button type="button" disabled={checkout.isPending||!selected.lines.length} onClick={()=>checkout.mutate()} className="mt-5 w-full rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground disabled:opacity-50">{checkout.isPending?t.working:t.checkout}</button>
        </div>
      </>}
    </>}
    {notice&&<div role="status" className="mt-5 rounded-xl border border-border bg-secondary p-4 text-sm"><p>{notice}</p>{orderId&&methods.length>0&&<section className="mt-3 space-y-3"><h3 className="font-bold">{t.payment}</h3><p>{t.order}: #{orderId.slice(0,8)}</p>{methods.map(m=><article key={m.method_id} className="rounded-lg bg-background p-3"><p className="font-semibold">{m.label}</p><p className="mt-1 whitespace-pre-wrap text-sm">{m.instructions}</p></article>)}</section>}{orderId&&<Link to="/orders" className="mt-3 inline-flex font-semibold text-coral hover:underline">{lang==="ar"?"عرض طلباتي":lang==="en"?"View my orders":"Voir mes commandes"}</Link>}</div>}
  </AuthShell>;
}
