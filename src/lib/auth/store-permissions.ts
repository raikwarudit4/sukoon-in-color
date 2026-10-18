import type { SupabaseClient } from "@supabase/supabase-js";

export type StorePermission =
  | "store.manage"
  | "catalog.manage"
  | "inventory.manage"
  | "orders.manage"
  | "customers.manage"
  | "marketing.manage"
  | "reviews.moderate"
  | "reports.read";

export async function hasStorePermission(
  supabase: SupabaseClient,
  storeId: string,
  permission: StorePermission,
) {
  const { data, error } = await supabase.rpc("has_store_permission", {
    target_store: storeId,
    required_permission: permission,
  });

  return !error && data === true;
}
