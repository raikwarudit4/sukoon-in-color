"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export type GalleryImage = { id: string; url: string; alt_text: string | null; sort_order: number };

export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const activeImage = images[activeIndex];

  useEffect(() => {
    if (!isZoomOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsZoomOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isZoomOpen]);

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-[#f4e9e5]">
        {activeImage ? (
          <button type="button" onClick={() => setIsZoomOpen(true)} aria-label="Open full-size product image" className="absolute inset-0 block h-full w-full cursor-zoom-in">
            <Image src={activeImage.url} alt={activeImage.alt_text || productName} fill priority sizes="(max-width: 1024px) 100vw, 50vw" unoptimized className="object-contain" />
            <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-[#27221f] shadow-sm">View full size</span>
          </button>
        ) : (
          <div className="grid h-full place-items-center text-6xl text-[#a15e61]">✿</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1" aria-label="Product images">
          {images.map((image, index) => (
            <button key={image.id} type="button" onClick={() => setActiveIndex(index)} aria-label={`Show image ${index + 1}`} aria-pressed={index === activeIndex} className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f4e9e5] border-2 ${index === activeIndex ? "border-[#a15e61]" : "border-transparent"}`}>
              <Image src={image.url} alt={image.alt_text || `${productName}, image ${index + 1}`} fill sizes="80px" unoptimized className="object-contain" />
            </button>
          ))}
        </div>
      )}
      {isZoomOpen && activeImage && <div role="dialog" aria-modal="true" aria-label={`${productName} full-size image`} onClick={() => setIsZoomOpen(false)} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-8">
        <button type="button" autoFocus onClick={() => setIsZoomOpen(false)} aria-label="Close full-size image" className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-white/95 text-2xl leading-none text-[#27221f] shadow-lg">×</button>
        <div className="relative h-[90dvh] w-full" onClick={(event) => event.stopPropagation()}>
          <Image src={activeImage.url} alt={activeImage.alt_text || productName} fill sizes="100vw" unoptimized priority className="object-contain" />
        </div>
      </div>}
    </div>
  );
}
