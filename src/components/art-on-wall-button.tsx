"use client";

/* The modal renders the product's original artwork file directly, without a resizing proxy. */
/* eslint @next/next/no-img-element: off */

import { useState } from "react";

type Props = {
  imageUrl: string;
  productName: string;
  originalDimensions?: string | null;
  purchaseType: "original" | "print";
  printSize?: string;
};

const WALL_HEIGHT_CM = 304.8;
// The supplied room reference marks a 10 ft wall over roughly 57% of its frame height.
const MARKED_WALL_FRACTION = 0.57;

function parseDimensions(value: string | null | undefined) {
  if (!value) return null;
  const cm = value.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*cm/i);
  if (cm) return { width: Number(cm[1]), height: Number(cm[2]) };
  const inch = value.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*(?:inches|inch|in)\b/i);
  if (inch) return { width: Number(inch[1]) * 2.54, height: Number(inch[2]) * 2.54 };
  const mm = value.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*mm\b/i);
  if (mm) return { width: Number(mm[1]) / 10, height: Number(mm[2]) / 10 };
  return null;
}

export function ArtOnWallButton({ imageUrl, productName, originalDimensions, purchaseType, printSize }: Props) {
  const [open, setOpen] = useState(false);
  const size = purchaseType === "print" ? parseDimensions(printSize) : parseDimensions(originalDimensions);
  const heightCm = size?.height ?? null;
  const heightFraction = heightCm ? Math.min(heightCm / WALL_HEIGHT_CM * MARKED_WALL_FRACTION, 0.72) : 0.2;
  const widthFraction = size && size.height > 0 ? Math.min(heightFraction * size.width / size.height, 0.72) : heightFraction * 0.72;

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-sm font-semibold text-[#493e39] hover:border-[#a15e61]">
      <span aria-hidden="true">▣</span> Art on wall
    </button>
    {open && <div role="dialog" aria-modal="true" aria-label={`${productName} on a wall`} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <button type="button" onClick={() => setOpen(false)} aria-label="Close preview" className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-2 text-xl shadow">×</button>
        <div className="relative aspect-[1364/789] overflow-hidden bg-[#eee9e4]">
          <img src="https://ahmwtluxkmjsycksumvj.supabase.co/storage/v1/object/public/art-on-wall/art-on-wall-background-new.jpg" alt="Room wall for artwork size preview" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute left-[32%] top-[39%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2" style={{ width: `${widthFraction * 100}%`, height: `${heightFraction * 100}%` }}>
            <img src={imageUrl} alt={productName} className="h-full w-full object-fill shadow-md" />
            {heightCm && <span className="absolute -right-7 top-0 h-full border-l border-[#27221f] after:absolute after:-left-1 after:top-0 after:h-px after:w-2 after:bg-[#27221f] before:absolute before:-left-1 before:bottom-0 before:h-px before:w-2 before:bg-[#27221f]" />}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-[#716763]">
          <span>{productName} · {purchaseType === "original" ? "Original painting" : printSize || "Print"}</span>
          <span className="text-xs">Approximate scale using a 10 ft wall marker</span>
        </div>
      </div>
    </div>}
  </>;
}
