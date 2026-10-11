"use client";

import { useState } from "react";

export function ShareProductButton({ title }: { title: string }) {
  const [message, setMessage] = useState("");

  async function share() {
    setMessage("");
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("Product link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Could not share or copy the product link.");
    }
  }

  return (
    <div>
      <button type="button" onClick={share} className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#d9c9bf] px-4 text-sm font-semibold text-[#514744] hover:border-[#a15e61] hover:text-[#a15e61]" aria-label={`Share ${title}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.3 3.3 0 0 0 0-1.39l7.05-4.11A3 3 0 1 0 15 5c0 .23.03.46.08.67L8.03 9.78a3 3 0 1 0 0 4.44l7.12 4.16a3 3 0 1 0 2.85-2.3Z" /></svg>
        Share
      </button>
      {message && <p role="status" className="mt-2 text-xs text-[#716763]">{message}</p>}
    </div>
  );
}
