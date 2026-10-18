"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type TeamMember = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  membership_status: string;
  roles: string[];
};

export function TeamAccessForm({ storeId, members }: { storeId: string; members: TeamMember[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase.rpc("set_store_member_role", {
      p_store_id: storeId,
      p_email: email.trim(),
      p_role_name: role === "remove" ? null : role,
    });

    setBusy(false);
    if (saveError) {
      setError(saveError.message.includes("existing account")
        ? "That email needs an existing account with a verified email before you can assign store access."
        : saveError.message.includes("last active owner")
          ? "You can’t remove or demote the last active owner."
          : saveError.message.includes("another owner")
            ? "Ask another owner to change your own access."
            : "Could not update team access. Check the email and try again.");
      return;
    }

    setEmail("");
    setMessage(role === "remove" ? "Store access removed." : `Store access set to ${role}.`);
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-8">
      <form onSubmit={save} className="max-w-2xl rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-7">
        <h2 className="text-lg font-medium">Assign or change access</h2>
        <p className="mt-2 text-sm leading-6 text-[#716763]">The person must already have a Sukoon in Color account and a verified email. This does not send an invitation.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end">
          <label className="block text-sm font-medium">Account email
            <input type="email" required maxLength={254} autoComplete="email" value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@example.com"
              className="mt-2 block w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-base outline-none focus:border-[#a15e61]" />
          </label>
          <label className="block text-sm font-medium">Access
            <select value={role} onChange={(event) => setRole(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-base outline-none focus:border-[#a15e61]">
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
              <option value="remove">Remove access</option>
            </select>
          </label>
          <button type="submit" disabled={busy}
            className="rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white hover:bg-[#884d50] disabled:opacity-60">
            {busy ? "Saving…" : "Save access"}
          </button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-[#7c4548]">{error}</p>}
        {message && <p role="status" className="mt-4 text-sm text-[#456247]">{message}</p>}
        <p className="mt-4 text-xs leading-5 text-[#716763]">Admins can manage products, inventory, orders, reviews, and reports. Owners can also change store settings and manage team access. The last active owner cannot be removed or demoted.</p>
      </form>

      <section className="max-w-4xl" aria-labelledby="team-members-heading">
        <h2 id="team-members-heading" className="text-lg font-medium">Store members</h2>
        {members.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-[#d9c9bf] bg-white/70 p-6 text-sm text-[#716763]">No members are assigned to this store yet.</p> : (
          <ul className="mt-4 divide-y divide-[#eee5de] rounded-2xl border border-[#eee5de] bg-white">
            {members.map((member) => {
              const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ");
              return <li key={member.email} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">{member.email}</p>
                  {fullName && <p className="mt-1 text-xs text-[#716763]">{fullName}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-[#f6eee9] px-3 py-1 text-[#674d46]">{member.membership_status}</span>
                  {member.roles.length ? member.roles.map((memberRole) => <span key={memberRole} className="rounded-full bg-[#f6eee9] px-3 py-1 capitalize text-[#674d46]">{memberRole.replaceAll("_", " ")}</span>) : <span className="text-[#716763]">No role</span>}
                </div>
              </li>;
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
