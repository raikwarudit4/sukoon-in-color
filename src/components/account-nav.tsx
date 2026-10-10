"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AccountNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [canManageOrders, setCanManageOrders] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function syncAccount(user: { id: string; email?: string } | null) {
      if (!isMounted) return;
      setEmail(user?.email ?? null);
      if (!user) {
        setCanManageOrders(false);
        return;
      }
      const { data: store } = await supabase.from("stores").select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
      if (!store) {
        if (isMounted) setCanManageOrders(false);
        return;
      }
      const { data: member, error } = await supabase.rpc("is_store_member", { target_store: store.id });
      if (isMounted) setCanManageOrders(!error && member === true);
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

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setEmail(null);
    router.refresh();
  }

  return (
    <nav aria-label="Account" className="flex items-center gap-4 text-sm">
      <Link href="/cart" className="text-[#716763] hover:text-[#a15e61]">
        Cart
      </Link>
      {email ? (
        <>
          {canManageOrders && <Link href="/admin/orders" className="text-[#716763] hover:text-[#a15e61]">Manage orders</Link>}
          <Link href="/orders" className="text-[#716763] hover:text-[#a15e61]">Orders</Link>
          <button
            type="button"
            onClick={signOut}
            className="font-medium text-[#a15e61] hover:underline"
            title={`Signed in as ${email}`}
          >
            Sign out
          </button>
        </>
      ) : (
        <Link href="/auth/sign-in" className="font-medium text-[#a15e61] hover:underline">
          Sign in
        </Link>
      )}
    </nav>
  );
}
