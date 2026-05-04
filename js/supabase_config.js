// ============================================================
// Configuracao do cliente Supabase
// ============================================================
// Projeto: financeiro-cetem-v05 (tlhiolvybkmruxzikmyj)
// Schema: tabela unica `empresas` com state em JSONB (modelo
//         drop-in do localStorage do app v0.5).
//
// O projeto CETEM-Finance (mmjfduvnejewluvqwkol) tem schema
// normalizado proprio (RBAC, plano de contas, conciliacao
// bancaria) e fica reservado para a versao "ERP" futura,
// que tera frontend dedicado e queries normalizadas.
// Nao misturar os dois enquanto o desenho final nao estiver
// fechado.
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
