// ============================================================
// auth.js - autenticacao via Supabase Auth (email/senha)
// ============================================================

const Auth = (() => {
  const sb = window.SB;
  const listeners = new Set();

  async function getSession() {
    const { data, error } = await sb.auth.getSession();
    if (error) { console.error('[Auth] getSession:', error); return null; }
    return data.session || null;
  }

  async function getUser() {
    const s = await getSession();
    return s ? s.user : null;
  }

  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: String(password || '')
    });
    if (error) return { ok: false, erro: traduzErro(error) };
    return { ok: true, session: data.session };
  }

  async function signOut() {
    const { error } = await sb.auth.signOut();
    if (error) console.error('[Auth] signOut:', error);
    listeners.forEach(fn => { try { fn(null); } catch {} });
  }

  function onChange(fn) {
    listeners.add(fn);
    const sub = sb.auth.onAuthStateChange((event, session) => {
      try { fn(session, event); } catch (e) { console.error(e); }
    });
    return () => { listeners.delete(fn); sub?.data?.subscription?.unsubscribe?.(); };
  }

  function traduzErro(e) {
    const m = (e && e.message) || String(e);
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'E-mail nao confirmado. Verifique sua caixa de entrada ou peca ao admin para confirmar manualmente.';
    if (/network/i.test(m)) return 'Falha de rede. Verifique sua conexao.';
    if (/rate limit/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos.';
    return m;
  }

  // ----- Tela de login -----
  function renderLoginScreen({ onSuccess } = {}) {
    // Limpa o body e injeta a tela de login
    document.body.innerHTML = `
      <div id="login-screen" style="
        min-height: 100vh; display: flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        font-family: ui-sans-serif, system-ui, sans-serif; padding: 1rem;
      ">
        <div style="
          background: white; border-radius: 0.75rem; overflow: hidden;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3);
          width: 100%; max-width: 24rem;
        ">
          <!-- Faixa escura no topo onde a logo (texto branco) fica visivel -->
          <div style="background: #0f172a; padding: 1.5rem 2rem 1.25rem; text-align: center;">
            <img src="icons/logo-cetem.png" alt="CETEM" style="height: 72px; margin: 0 auto 0.5rem; display: block;" />
            <h1 style="font-size: 1rem; font-weight: 600; color: #f1f5f9; margin: 0; letter-spacing: 0.05em;">GERÊNCIA FINANCEIRA</h1>
          </div>
          <div style="padding: 1.5rem 2rem 0.5rem; text-align: center;">
            <p style="font-size: 0.875rem; color: #64748b; margin: 0;">Entre com seu e-mail e senha</p>
          </div>
          <div style="padding: 0 2rem 2rem;">

          <form id="login-form" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label style="display: block;">
              <span style="font-size: 0.75rem; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">E-mail</span>
              <input id="login-email" type="email" required autocomplete="email" style="
                width: 100%; margin-top: 0.25rem; padding: 0.625rem 0.75rem;
                border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;
                box-sizing: border-box;
              " />
            </label>
            <label style="display: block;">
              <span style="font-size: 0.75rem; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Senha</span>
              <input id="login-password" type="password" required autocomplete="current-password" style="
                width: 100%; margin-top: 0.25rem; padding: 0.625rem 0.75rem;
                border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;
                box-sizing: border-box;
              " />
            </label>

            <div id="login-error" style="
              display: none; background: #fef2f2; border: 1px solid #fecaca;
              color: #b91c1c; padding: 0.5rem 0.75rem; border-radius: 0.375rem;
              font-size: 0.8125rem;
            "></div>

            <button id="login-submit" type="submit" style="
              margin-top: 0.5rem; padding: 0.625rem 0.75rem;
              background: #0f172a; color: white; font-weight: 600;
              border: none; border-radius: 0.375rem; cursor: pointer;
              font-size: 0.875rem;
            ">Entrar</button>
          </form>

          <p style="margin-top: 1.25rem; font-size: 0.75rem; color: #94a3b8; text-align: center; line-height: 1.4;">
            Acesso interno CETEM. Se voce ainda nao tem conta,<br>fale com o administrador para receber um convite.
          </p>
          </div>
        </div>
      </div>
    `;

    const form = document.getElementById('login-form');
    const errBox = document.getElementById('login-error');
    const btn = document.getElementById('login-submit');
    const inpEmail = document.getElementById('login-email');
    const inpPass = document.getElementById('login-password');

    inpEmail.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Entrando...';
      const r = await signIn(inpEmail.value, inpPass.value);
      btn.disabled = false;
      btn.textContent = 'Entrar';
      if (!r.ok) {
        errBox.textContent = r.erro;
        errBox.style.display = 'block';
        return;
      }
      if (typeof onSuccess === 'function') onSuccess(r.session);
      else location.reload();
    });
  }

  return {
    sb,
    getSession,
    getUser,
    signIn,
    signOut,
    onChange,
    renderLoginScreen
  };
})();
