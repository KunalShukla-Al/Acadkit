/**
 * The Mac's way into AcadKit's backend for PersonaOS jobs: the service-role
 * client and my PIN, from the environment the orchestrator loaded.
 */
import { macClient } from "../mac-client.mjs";

export function backend(env = process.env) {
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !/^\d{4}$/.test(env.STUDY_PIN ?? "")) {
    throw new Error("needs VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN in the environment");
  }
  return { supabase: macClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), pin: env.STUDY_PIN };
}
