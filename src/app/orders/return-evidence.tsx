"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ReturnEvidence({ paths }: { paths: string[] }) {
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const results = await Promise.all(paths.map(async (path) => {
        const { data } = await supabase.storage.from("return-evidence").createSignedUrl(path, 3600);
        return data?.signedUrl ? { path, url: data.signedUrl } : null;
      }));
      if (active) setImages(results.filter((image): image is { path: string; url: string } => image !== null));
    }
    if (paths.length) void load();
    return () => { active = false; };
  }, [paths]);

  if (!paths.length) return null;
  return <div className="mt-3 flex flex-wrap gap-2" aria-label="Return photo evidence">
    {images.map((image) => <a key={image.path} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-[#eee5de]">
      <Image src={image.url} alt="Photo attached to return request" width={144} height={108} unoptimized className="h-24 w-32 object-cover" />
    </a>)}
    {!images.length && <p className="text-xs text-[#716763]">Loading return photos…</p>}
  </div>;
}
