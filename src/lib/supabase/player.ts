import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

// جلسة الشاشة منفصلة عن جلسة لوحة التحكم حتى لو فُتحتا في المتصفح نفسه
export function getPlayerClient() {
  client ??= createClient(supabaseUrl, supabaseKey, {
    auth: {
      storageKey: "signage-player-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
