import { createClient } from '@supabase/supabase-js';

function inferSupabaseUrlFromKey(anonKey) {
  if (!anonKey) {
    return '';
  }

  try {
    const payload = anonKey.split('.')[1];
    if (!payload) {
      return '';
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    const json = atob(`${normalized}${'='.repeat(padLength)}`);
    const parsed = JSON.parse(json);
    return parsed.ref ? `https://${parsed.ref}.supabase.co` : '';
  } catch {
    return '';
  }
}

export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || inferSupabaseUrlFromKey(supabaseAnonKey);
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function isSupabaseConfigured() {
  return supabaseConfigured;
}
