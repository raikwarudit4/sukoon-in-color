import { createClient } from "@/lib/supabase/server";
import { hasAllowedRequestOrigin } from "@/lib/request-origin";
import { getShiprocketMode, getShiprocketToken } from "@/lib/shiprocket/mode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasAllowedRequestOrigin(request)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  if (getShiprocketMode() !== "sandbox") return Response.json({ error: "Set SHIPROCKET_MODE=sandbox to test sandbox credentials." }, { status: 409 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in with the store account." }, { status: 401 });
  const { data: store } = await supabase.from("stores").select("id").eq("slug", "sukoon-in-color").eq("status", "active").maybeSingle();
  if (!store) return Response.json({ error: "The store is unavailable." }, { status: 503 });
  const { data: isMember } = await supabase.rpc("is_store_member", { target_store: store.id });
  if (isMember !== true) return Response.json({ error: "Store membership is required." }, { status: 403 });

  try {
    await getShiprocketToken("sandbox");
    return Response.json({ connected: true, mode: "sandbox" });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured")
      ? error.message
      : error instanceof Error && error.message.includes("authentication failed")
        ? error.message
        : "Could not connect to Shiprocket sandbox. No shipment was created.";
    return Response.json({ error: message }, { status: message.includes("not configured") ? 503 : 502 });
  }
}
