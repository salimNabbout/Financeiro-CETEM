// ============================================================
// Configuracao do cliente Supabase (uso interno - provisorio)
// ============================================================
// Estas chaves sao seguras para client-side desde que RLS esteja
// configurado. Trocar por env vars / build-time substitution quando
// migrar para a versao final com pipeline de deploy.
// ============================================================

window.SUPABASE_URL = 'https://tlhiolvybkmruxzikmyj.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_urg2_W3KZlS5A9z80conQA_Ou_NobYm';

// Flag global para o app saber qual backend esta ativo
window.DB_BACKEND = 'supabase';

// ============================================================
// Lista de emails com permissao de admin (acoes destrutivas).
// Emails fora desta lista NAO veem botoes como "Zerar" ou
// "Importar" (que substituiria todos os dados).
// Use minusculas. Para adicionar mais: ['salim@...', 'outro@...']
// ============================================================
window.ADMIN_EMAILS = ['salim@cetemrj.com.br'];
