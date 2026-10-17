(() => {
  const message = document.getElementById('form-message');
  if (!message) return;
  const form = document.getElementById('auth-form');
  const $ = (id) => document.getElementById(id);
  const buttons = { signin: $('mode-signin'), invite: $('mode-invite'), bootstrap: $('mode-bootstrap') };
  const fields = { name: $('name-field'), invite: $('invite-field'), confirm: $('confirm-field') };
  const inputs = { name: $('full-name'), email: $('email'), code: $('invite-code'), password: $('password'), confirm: $('confirm-password') };
  const footer = $('auth-footer');
  let mode = 'signin';
  let busy = false;
  let supabase;

  const show = (text, kind = 'info') => {
    message.textContent = text;
    message.dataset.kind = kind;
    message.hidden = false;
  };
  const setBusy = (value) => {
    busy = value;
    $('submit-button').disabled = value;
    $('submit-button').setAttribute('aria-busy', String(value));
    $('submit-button').querySelector('span')?.setAttribute('aria-hidden', 'true');
  };
  const currentReturnUrl = () => `${location.origin}${location.pathname}`;
  const setMode = (next) => {
    mode = next;
    for (const [key, button] of Object.entries(buttons)) button.setAttribute('aria-pressed', String(key === next));
    const needsName = next !== 'signin';
    const needsInvite = next === 'invite';
    fields.name.hidden = !needsName;
    inputs.name.disabled = !needsName;
    inputs.name.required = needsName;
    fields.invite.hidden = !needsInvite;
    inputs.code.disabled = !needsInvite;
    inputs.code.required = needsInvite;
    fields.confirm.hidden = !needsName;
    inputs.confirm.disabled = !needsName;
    inputs.confirm.required = needsName;
    inputs.password.autocomplete = needsName ? 'new-password' : 'current-password';
    $('forgot-row').hidden = next !== 'signin';
    $('card-title').textContent = next === 'invite' ? 'Accept your campus invitation.' : next === 'bootstrap' ? 'Set up your campus administrator.' : 'Welcome back.';
    $('card-intro').textContent = next === 'invite'
      ? 'Enter the one-time invitation code from your campus administrator.'
      : next === 'bootstrap'
        ? 'Use the designated campus administrator email to create the first coordinator account.'
        : 'Sign in with your campus account to continue to EVOYOU.';
    $('submit-button').firstChild.textContent = next === 'invite' ? 'Create invited account ' : next === 'bootstrap' ? 'Set up first administrator ' : 'Sign in ';
    inputs.password.value = '';
    inputs.confirm.value = '';
    inputs.confirm.setCustomValidity('');
    message.hidden = true;
  };

  buttons.signin.addEventListener('click', () => setMode('signin'));
  buttons.invite.addEventListener('click', () => setMode('invite'));
  buttons.bootstrap.addEventListener('click', () => setMode('bootstrap'));

  document.querySelectorAll('[data-toggle-password]').forEach((button) => button.addEventListener('click', () => {
    const input = $(button.dataset.togglePassword);
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    button.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
    button.title = showing ? 'Hide password' : 'Show password';
  }));

  async function getClient() {
    if (supabase) return supabase;
    const url = window.EVOYOU_SUPABASE_URL;
    const key = window.EVOYOU_SUPABASE_PUBLISHABLE_KEY;
    const createClient = window.supabase?.createClient;
    if (!url || !key || typeof createClient !== 'function') throw new Error('The Supabase client or public project configuration did not load. Refresh the page and check the network connection.');
    supabase = createClient(url, key, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
    return supabase;
  }

  async function completePendingMembership(client, user) {
    const name = String(user.user_metadata?.full_name || inputs.name.value || '').trim().slice(0, 120);
    if (!name) return;
    const adminResult = await client.rpc('bootstrap_first_admin', { p_full_name: name });
    if (adminResult.error) throw adminResult.error;
    const studentResult = await client.rpc('complete_student_invitation', { p_full_name: name });
    if (studentResult.error) throw studentResult.error;
  }

  async function routeVerifiedUser(client, user) {
    const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
    if (!confirmed) {
      show('Check your email and confirm your address before signing in.', 'info');
      return false;
    }
    await completePendingMembership(client, user);
    const { data, error } = await client.from('memberships').select('institution_id,role,full_name').eq('user_id', user.id);
    if (error) throw error;
    if (!data?.length) {
      show('Your email is verified, but campus access has not been assigned. Ask your campus administrator for an invitation.', 'error');
      return false;
    }
    if (data.length > 1) {
      show('Your account belongs to more than one campus. Please contact the project administrator to choose a workspace.', 'error');
      return false;
    }
    const membership = data[0];
    sessionStorage.setItem('evoyou-active-institution', membership.institution_id);
    location.assign('campus-workspace.html');
    return true;
  }

  async function sendStudentSignup({ email, password, name, code }) {
    const url = window.EVOYOU_SUPABASE_URL;
    const key = window.EVOYOU_SUPABASE_PUBLISHABLE_KEY;
    const response = await fetch(`${url}/functions/v1/evoyou-create-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ email, password, full_name: name, invitation_code: code, email_redirect_to: currentReturnUrl() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The invitation could not be accepted. Please check the email and code with your administrator.');
    show(data.message || 'Account request received. Check your email to confirm your address, then sign in.', 'success');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const email = inputs.email.value.trim().toLowerCase();
    const password = inputs.password.value;
    const name = inputs.name.value.trim();
    if (mode !== 'signin' && name.length < 2) return show('Enter your full name.', 'error');
    if (mode !== 'signin' && password.length < 8) return show('Choose a password with at least 8 characters.', 'error');
    if (mode !== 'signin' && password !== inputs.confirm.value) return show('The passwords do not match.', 'error');
    if (mode === 'invite' && inputs.code.value.trim().length < 12) return show('Enter the one-time invitation code from your campus administrator.', 'error');
    setBusy(true);
    message.hidden = true;
    try {
      const client = await getClient();
      if (mode === 'signin') {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) await routeVerifiedUser(client, data.user);
      } else if (mode === 'bootstrap') {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: currentReturnUrl() } });
        if (error) throw error;
        if (data.session && data.user) await routeVerifiedUser(client, data.user);
        else show('Administrator account request received. Confirm this email address. If it is the campus bootstrap email, you will be assigned the first administrator role after verification.', 'success');
      } else {
        await sendStudentSignup({ email, password, name, code: inputs.code.value.trim() });
      }
    } catch (error) {
      console.error('EVOYOU authentication error:', error);
      const text = error?.message || 'The access request could not be completed.';
      if (/bootstrap|administrator access|invitation|campus access|membership|schema cache|does not exist/i.test(text)) show('Campus access setup is incomplete or this email is not authorized for the selected action. Ask the EVOYOU project administrator to verify the campus setup.', 'error');
      else if (/invalid login credentials/i.test(text)) show('The email or password is incorrect. If this is your first sign-in, confirm your email first.', 'error');
      else if (/email not confirmed/i.test(text)) show('Confirm your email using the link we sent, then sign in.', 'error');
      else show(text, 'error');
    } finally {
      setBusy(false);
    }
  });

  $('forgot-button').addEventListener('click', async () => {
    if (!form.reportValidity() && !inputs.email.value.trim()) return;
    try {
      const client = await getClient();
      const { error } = await client.auth.resetPasswordForEmail(inputs.email.value.trim().toLowerCase(), { redirectTo: currentReturnUrl() });
      if (error) throw error;
      show('If an account exists for that address, password recovery instructions have been sent.', 'success');
    } catch (error) {
      show(error?.message || 'Password recovery could not be started. Please try again.', 'error');
    }
  });

  (async () => {
    try {
      const client = await getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      const session = data?.session;
      if (session?.user && (session.user.email_confirmed_at || session.user.confirmed_at)) await routeVerifiedUser(client, session.user);
    } catch (error) {
      footer.textContent = 'Supabase Auth · refresh or check the project connection';
      if (error?.message) show(`Supabase is not ready: ${error.message}`, 'error');
    }
  })();
})();
