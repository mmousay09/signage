import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

export function getRenterClient() {
  client ??= createClient(supabaseUrl, supabaseKey, {
    auth: {
      storageKey: "signage-renter-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
