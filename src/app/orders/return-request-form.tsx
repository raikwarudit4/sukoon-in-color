"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; name: string; quantity: number };
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoBytes = 5 * 1024 * 1024;

export function ReturnRequestForm({ orderId, userId, items }: { orderId: string; userId: string; items: Item[] }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const requestItems = Object.entries(selected)
      .filter(([, quantity]) => quantity > 0)
      .map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
    const supabase = createClient();
    const uploadedPaths: string[] = [];
    for (const photo of photos) {
      const extension = photo.type === "image/jpeg" ? "jpg" : photo.type === "image/png" ? "png" : "webp";
      const path = `${userId}/${orderId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("return-evidence").upload(path, photo, {
        cacheControl: "3600",
        contentType: photo.type,
        upsert: false,
      });
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from("return-evidence").remove(uploadedPaths);
        setBusy(false);
        setError("Could not upload the photos. Check the file type and size, then try again.");
        return;
      }
      uploadedPaths.push(path);
    }

    const { error: requestError } = await supabase.rpc("request_order_return", {
      p_order_id: orderId,
      p_reason: reason,
      p_items: requestItems,
      p_evidence: uploadedPaths,
    });
    setBusy(false);
    if (requestError) {
      if (uploadedPaths.length) await supabase.storage.from("return-evidence").remove(uploadedPaths);
      setError(requestError.message.includes("return") || requestError.message.includes("item")
        ? requestError.message
        : "Could not submit the return request. Refresh and try again.");
      return;
    }
    router.refresh();
  }

  return <form onSubmit={submit} className="mt-5 rounded-xl border border-[#eee5de] bg-[#fffdfa] p-4">
    <h3 className="font-semibold">Request a return</h3>
    <p className="mt-1 text-xs text-[#716763]">Choose items and quantities, then tell us why. The store will review your request; refunds and pickup are arranged separately.</p>
    <div className="mt-3 space-y-2">
      {items.map((item) => <label key={item.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>{item.name} <span className="text-[#716763]">· purchased {item.quantity}</span></span>
        <select aria-label={`Return quantity for ${item.name}`} value={selected[item.id] ?? 0}
          onChange={(event) => setSelected((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
          className="rounded-lg border border-[#d9c9bf] bg-white px-2 py-1">
          {Array.from({ length: item.quantity + 1 }, (_, quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
        </select>
      </label>)}
    </div>
    <label className="mt-3 block text-sm font-medium">Reason
      <textarea required minLength={5} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
        className="mt-1 block min-h-20 w-full rounded-lg border border-[#d9c9bf] bg-white p-3 font-normal" />
    </label>
    <label className="mt-3 block text-sm font-medium">Photos (optional, up to 3)
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          if (chosen.length > 3) {
            setError("Choose no more than three photos.");
            event.target.value = "";
            setPhotos([]);
            return;
          }
          const invalid = chosen.some((file) => !allowedImageTypes.has(file.type) || file.size > maxPhotoBytes);
          if (invalid) {
            setError("Use JPG, PNG, or WebP photos up to 5 MB each.");
            event.target.value = "";
            setPhotos([]);
            return;
          }
          setError("");
          setPhotos(chosen);
        }}
        className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#f2e9e4] file:px-3 file:py-2 file:text-xs file:font-semibold" />
    </label>
    {photos.length > 0 && <p className="mt-1 text-xs text-[#716763]">{photos.map((photo) => photo.name).join(", ")}</p>}
    <button disabled={busy} className="mt-3 rounded-lg bg-[#a15e61] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
      {busy ? "Submitting…" : "Submit return request"}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-[#7c4548]">{error}</p>}
  </form>;
}
