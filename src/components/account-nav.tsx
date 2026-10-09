"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AccountNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (isMounted) setEmail(error ? null : (data.user?.email ?? null));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
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
