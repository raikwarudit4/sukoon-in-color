import Link from "next/link";
import { redirect } from "next/navigation";
import { hasStorePermission } from "@/lib/auth/store-permissions";
import { createClient } from "@/lib/supabase/server";
import { TeamAccessForm } from "./team-access-form";

type TeamMember = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  membership_status: string;
  roles: string[];
};

export default async function TeamAccessPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/sign-in?next=%2Fadmin%2Fsettings%2Fteam");

  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id, name").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (storeError || !store) return <main className="p-8">Store settings are unavailable.</main>;

  const canManageStore = await hasStorePermission(supabase, store.id, "store.manage");
  if (!canManageStore) return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] px-6 text-[#27221f]"><section className="max-w-md rounded-2xl border border-[#ead5d2] bg-white p-8 text-center">
    <h1 className="text-xl font-medium">Owner access required</h1><p className="mt-2 text-sm text-[#716763]">Only store owners can manage team access.</p><Link href="/" className="mt-5 inline-block font-semibold text-[#a15e61]">Back to shop</Link>
  </section></main>;

  const { data, error } = await supabase.rpc("list_store_team_members", { target_store: store.id });
  if (error) return <main className="grid min-h-screen place-items-center bg-[#fbf8f4] p-6 text-[#7c4548]"><p>Could not load team access. Apply migration 076, then refresh.</p></main>;
  const members = (data ?? []) as TeamMember[];

  return <main className="min-h-screen bg-[#fbf8f4] text-[#27221f]">
    <header className="border-b border-[#e8dfd7] bg-[#fbf8f4]"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
      <Link href="/" className="text-lg font-semibold tracking-[0.12em]">SUKOON <span className="text-[#b56e70]">IN COLOR</span></Link>
      <nav aria-label="Owner settings" className="flex flex-wrap gap-4 text-sm"><Link href="/admin" className="text-[#716763] hover:text-[#a15e61]">Dashboard</Link><Link href="/admin/settings/shipping" className="text-[#716763] hover:text-[#a15e61]">Shipping</Link><Link href="/admin/settings/returns" className="text-[#716763] hover:text-[#a15e61]">Returns</Link></nav>
    </div></header>
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Owner settings</p>
      <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Team access</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#716763]">Manage who can work in {store.name}. Assign access only to people whose verified account you recognize.</p>
      <TeamAccessForm storeId={store.id} members={members} />
    </section>
  </main>;
}
