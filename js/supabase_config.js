// ============================================================
// Configuracao do cliente Supabase — projeto CETEM-Finance
// ============================================================
// Estas chaves sao seguras para client-side desde que RLS esteja
// configurado corretamente no banco. Trocar por env vars / build-time
// substitution quando migrar para pipeline de deploy maduro.
// ============================================================

window.SUPABASE_URL = 'https://mmjfduvnejewluvqwkol.supabase.co';
window.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tamZkdXZuZWpld2x1dnF3a29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTA1OTQsImV4cCI6MjA5MjgyNjU5NH0.Vu8miLDBpRluQ20-TyYAIKN0eAVned_xNGnc8F_IrbQ';

// Flag global para o app saber qual backend esta ativo
window.DB_BACKEND = 'supabase';

// ============================================================
// Lista de emails com permissao de admin (acoes destrutivas).
// Emails fora desta lista NAO veem botoes como "Zerar" ou
// "Importar" (que substituiria todos os dados).
// Use minusculas. Para adicionar mais: ['salim@...', 'outro@...']
// ============================================================
window.ADMIN_EMAILS = ['salim@cetemrj.com.br'];
