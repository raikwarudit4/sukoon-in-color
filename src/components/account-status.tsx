"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AccountStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data, error: authError }) => {
      if (mounted) setEmail(authError ? null : data.user?.email ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    setBusy(true);
    setError("");
    const { error: signOutError } = await createClient().auth.signOut();
    setBusy(false);
    if (signOutError) {
      setError("Could not sign out. Please try again.");
      return;
    }
    setEmail(null);
    router.replace("/");
    router.refresh();
  }

  if (!email) return null;

  return (
    <div className="border-b border-[#e8dfd7] bg-white/70 text-[#716763]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-x-3 gap-y-1 px-6 py-2 text-xs sm:px-10">
        <span className="min-w-0 break-all">Signed in as <strong className="font-medium text-[#27221f]">{email}</strong></span>
        <button type="button" onClick={signOut} disabled={busy}
          className="shrink-0 font-semibold text-[#a15e61] hover:underline disabled:opacity-60">
          {busy ? "Signing out…" : "Sign out"}
        </button>
        {error && <span role="alert" className="basis-full text-right text-[#7c4548]">{error}</span>}
      </div>
    </div>
  );
}
