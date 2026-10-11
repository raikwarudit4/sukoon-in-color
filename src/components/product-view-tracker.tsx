"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ProductViewTracker({ storeId, productId }: { storeId: string; productId: string }) {
  const router = useRouter();
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;

    const sessionKey = "sukoon-product-view-session";
    let viewerKey = sessionStorage.getItem(sessionKey);
    if (!viewerKey) {
      viewerKey = crypto.randomUUID();
      sessionStorage.setItem(sessionKey, viewerKey);
    }

    const supabase = createClient();
    void supabase.rpc("record_public_product_view", {
      p_store_id: storeId,
      p_product_id: productId,
      p_viewer_key: viewerKey,
    }).then(({ error }) => {
      if (error) {
        console.error("Could not record the product view:", error.code, error.message);
        return;
      }
      router.refresh();
    });
  }, [productId, router, storeId]);

  return null;
}
