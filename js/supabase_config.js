// ============================================================
// Configuracao do cliente Supabase
// ============================================================
// Projeto: cetem-financeiro-app (tjywvfaqwmbxmoirhgfe)
// Organizacao: CETEM Tecnologia
// Schema: tabela unica `empresas` com state em JSONB (modelo
//         drop-in do localStorage do app v0.5).
//
// O projeto CETEM-Finance (mmjfduvnejewluvqwkol), com 19 tabelas
// normalizadas (RBAC, plano de contas, conciliacao bancaria),
// fica reservado para a versao "ERP" futura, com frontend
// dedicado e queries normalizadas.
// Nao misturar os dois enquanto o desenho final nao estiver
// fechado.
// ============================================================

window.SUPABASE_URL = 'https://tjywvfaqwmbxmoirhgfe.supabase.co';
window.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqeXd2ZmFxd21ieG1vaXJoZ2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTc0ODQsImV4cCI6MjA5MzQ5MzQ4NH0.dXaopU-TCZohsZzBxU82_d9D_oMGxw932hM4BtBrcSE';

// Flag global para o app saber qual backend esta ativo
window.DB_BACKEND = 'supabase';

// ============================================================
// Lista de emails com permissao de admin (acoes destrutivas).
// Emails fora desta lista NAO veem botoes como "Zerar" ou
// "Importar" (que substituiria todos os dados).
// Use minusculas. Para adicionar mais: ['salim@...', 'outro@...']
// ============================================================
window.ADMIN_EMAILS = ['salim@cetemrj.com.br'];
