import { createClient } from '@supabase/supabase-js'
// import type { Database } from '../types/database'   // descomentar tras `npm run types`

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
