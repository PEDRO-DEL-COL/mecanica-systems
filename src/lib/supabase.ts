import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';

// Valores validados em src/env.ts (erro claro se faltarem).
export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true }
});
