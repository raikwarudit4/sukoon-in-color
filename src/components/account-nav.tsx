"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AccountNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [canManageOrders, setCanManageOrders] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    let activeStoreId: string | null = null;
    let activeProfileId: string | null = null;

    async function refreshCounts() {
      if (!activeStoreId || !activeProfileId) {
        if (isMounted) {
          setSavedCount(0);
          setCartCount(0);
        }
        return;
      }
      const [wishlistResult, cartResult] = await Promise.all([
        supabase.from("wishlist_items").select("id", { count: "exact", head: true }).eq("store_id", activeStoreId),
        supabase.from("carts").select("cart_items(quantity)").eq("store_id", activeStoreId).eq("user_id", activeProfileId).maybeSingle(),
      ]);
      const quantity = cartResult.data?.cart_items?.reduce((sum, item) => sum + Number(item.quantity), 0) ?? 0;
      if (isMounted) {
        setSavedCount(wishlistResult.error ? 0 : wishlistResult.count ?? 0);
        setCartCount(cartResult.error ? 0 : quantity);
      }
    }

    async function syncAccount(user: { id: string; email?: string } | null) {
      if (!isMounted) return;
      setEmail(user?.email ?? null);
      if (!user) {
        setCanManageOrders(false);
        setSavedCount(0);
        setCartCount(0);
        activeStoreId = null;
        activeProfileId = null;
        return;
      }
      const { data: store } = await supabase.from("stores").select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
      if (!store) {
        activeStoreId = null;
        activeProfileId = null;
        if (isMounted) {
          setCanManageOrders(false);
          setSavedCount(0);
          setCartCount(0);
        }
        return;
      }
      activeStoreId = store.id;
      const [{ data: canManageOrders, error }, { data: profile }] = await Promise.all([
        supabase.rpc("has_store_permission", { target_store: store.id, required_permission: "orders.manage" }),
        supabase.from("users").select("id").eq("auth_user_id", user.id).maybeSingle(),
      ]);
      activeProfileId = profile?.id ?? null;
      if (isMounted) setCanManageOrders(!error && canManageOrders === true);
      await refreshCounts();
    }

    supabase.auth.getUser().then(({ data, error }) => {
      void syncAccount(error ? null : (data.user ? { id: data.user.id, email: data.user.email } : null));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ? { id: session.user.id, email: session.user.email } : null;
      setTimeout(() => void syncAccount(nextUser), 0);
    });

    const onCountsUpdated = () => { void refreshCounts(); };
    window.addEventListener("wishlist-updated", onCountsUpdated);
    window.addEventListener("cart-updated", onCountsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener("wishlist-updated", onCountsUpdated);
      window.removeEventListener("cart-updated", onCountsUpdated);
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setEmail(null);
    setMenuOpen(false);
    router.refresh();
  }

  return (
    <nav aria-label="Account" className="relative text-sm">
      <div className="hidden items-center gap-4 md:flex">
        <Link href="/cart" className="text-[#716763] hover:text-[#a15e61]">Cart{cartCount > 0 ? `(${cartCount})` : ""}</Link>
        {email ? (
          <>
            <Link href="/wishlist" className="text-[#716763] hover:text-[#a15e61]">Wishlist{savedCount > 0 ? `(${savedCount})` : ""}</Link>
            {canManageOrders && <Link href="/admin" className="text-[#716763] hover:text-[#a15e61]">Manage store</Link>}
            <Link href="/orders" className="text-[#716763] hover:text-[#a15e61]">Orders</Link>
            <button type="button" onClick={signOut} className="font-medium text-[#a15e61] hover:underline" title={`Signed in as ${email}`}>
              Sign out
            </button>
          </>
        ) : (
          <Link href="/auth/sign-in" className="font-medium text-[#a15e61] hover:underline">Sign in</Link>
        )}
      </div>

      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d9c9bf] px-3 font-medium text-[#716763] md:hidden"
        aria-expanded={menuOpen}
        aria-controls="mobile-account-menu"
        aria-label={menuOpen ? "Close account menu" : "Open account menu"}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? "Close" : "Menu"}
      </button>

      {menuOpen && (
        <div id="mobile-account-menu" className="absolute right-0 top-full z-20 mt-2 flex min-w-48 flex-col gap-1 rounded-2xl border border-[#e8dfd7] bg-white p-2 shadow-lg md:hidden">
          {email && <p className="truncate px-3 py-2 text-xs text-[#716763]">{email}</p>}
          <Link href="/cart" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 text-[#716763] hover:bg-[#fbf8f4]">Cart{cartCount > 0 ? `(${cartCount})` : ""}</Link>
          {email ? (
            <>
              <Link href="/wishlist" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 text-[#716763] hover:bg-[#fbf8f4]">Wishlist{savedCount > 0 ? `(${savedCount})` : ""}</Link>
              {canManageOrders && <Link href="/admin" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 text-[#716763] hover:bg-[#fbf8f4]">Manage store</Link>}
              <Link href="/orders" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 text-[#716763] hover:bg-[#fbf8f4]">Orders</Link>
              <button type="button" onClick={signOut} className="rounded-xl px-3 py-2.5 text-left font-medium text-[#a15e61] hover:bg-[#fbf8f4]">Sign out</button>
            </>
          ) : (
            <Link href="/auth/sign-in" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 font-medium text-[#a15e61] hover:bg-[#fbf8f4]">Sign in</Link>
          )}
        </div>
      )}
    </nav>
  );
}
