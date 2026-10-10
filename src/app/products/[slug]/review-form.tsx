"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReviewForm({ productId, storeId, userId }: { productId: string; storeId: string; userId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState("5");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const supabase = createClient();
    const { error: submitError } = await supabase.from("reviews").insert({
      store_id: storeId,
      product_id: productId,
      user_id: userId,
      rating: Number(rating),
      title: title.trim() || null,
      body: body.trim(),
      status: "pending",
    });
    setSaving(false);

    if (submitError) {
      setError(submitError.code === "23505"
        ? "You have already submitted a review for this product."
        : "Could not submit your review. Confirm your order has been delivered and try again.");
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl border border-[#eee5de] bg-white p-5 sm:p-6">
      <h3 className="font-medium">Share your experience</h3>
      <label htmlFor="review-rating" className="mt-4 block text-sm font-medium">Your rating</label>
      <select id="review-rating" value={rating} onChange={(event) => setRating(event.target.value)} className="mt-2 rounded-xl border border-[#d9c9bf] bg-white px-3 py-2.5 text-sm">
        <option value="5">★★★★★ — Loved it</option>
        <option value="4">★★★★☆ — Very good</option>
        <option value="3">★★★☆☆ — It’s okay</option>
        <option value="2">★★☆☆☆ — Could be better</option>
        <option value="1">★☆☆☆☆ — Not for me</option>
      </select>
      <label htmlFor="review-title" className="mt-4 block text-sm font-medium">Title (optional)</label>
      <input id="review-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-[#d9c9bf] px-4 py-3 text-sm outline-none focus:border-[#a15e61]" />
      <label htmlFor="review-body" className="mt-4 block text-sm font-medium">Your review</label>
      <textarea id="review-body" value={body} onChange={(event) => setBody(event.target.value)} required minLength={5} maxLength={2000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-[#d9c9bf] px-4 py-3 text-sm outline-none focus:border-[#a15e61]" />
      <p className="mt-2 text-xs text-[#716763]">Reviews are published after store approval.</p>
      {error && <p role="alert" className="mt-3 text-sm text-[#7c4548]">{error}</p>}
      <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white hover:bg-[#884d50] disabled:opacity-60">{saving ? "Submitting…" : "Submit review"}</button>
    </form>
  );
}
