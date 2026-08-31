const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || (!supabaseServiceRoleKey && !supabaseAnonKey)) {
  console.warn('AVISO: Supabase não configurado. Defina SUPABASE_URL e pelo menos SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY.');
}

const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

module.exports = {
  supabaseAdmin,
  supabaseUrl,
  supabaseServiceRoleKey,
};