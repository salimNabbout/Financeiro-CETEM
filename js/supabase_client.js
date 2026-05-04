// ============================================================
// supabase_client.js - cliente Supabase singleton
// ============================================================
// Compartilhado por db_supabase.js e auth.js para que ambos
// enxerguem a MESMA sessao de autenticacao.
// ============================================================

if (!window.supabase || !window.supabase.createClient) {
  console.error('[Supabase] supabase-js nao carregou. Verifique a tag <script> do CDN no index.html.');
}

window.SB = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
      storageKey: 'cetem-fin-auth'
    }
  }
);
