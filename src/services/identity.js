import { getSupabase } from '../lib/supabase.js';

const normalizeBase = (value) => String(value || '').trim().replace(/\/+$/, '');
const normalizePath = (value) => `/${String(value || '/').replace(/^\/+/, '')}`;

function redirectUrl(path) {
  const configured = normalizeBase(import.meta.env.VITE_PUBLIC_APP_URL);
  if (configured) return `${configured}${normalizePath(path)}`;
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return new URL(`${base}${normalizePath(path).slice(1)}`, window.location.origin).toString();
}

export const identity = Object.freeze({
  async getSession() {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    return data.session ?? null;
  },
  onAuthStateChange(callback) {
    return getSupabase().auth.onAuthStateChange((_event, session) => callback(session));
  },
  signIn({ email, password }) {
    return getSupabase().auth.signInWithPassword({ email, password });
  },
  signUp({ email, password, fullName = '' }) {
    return getSupabase().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: redirectUrl('/profile') },
    });
  },
  resendSignUpConfirmation(email) {
    return getSupabase().auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl('/profile') } });
  },
  signInWithMagicLink(email) {
    return getSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl('/'), shouldCreateUser: false },
    });
  },
  signOut() {
    return getSupabase().auth.signOut({ scope: 'local' });
  },
});
