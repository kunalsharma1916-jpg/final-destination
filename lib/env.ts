const FALLBACKS = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dev-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "dev-service-role-key",
  SESSION_SECRET: "dev-session-secret-12345",
  ADMIN_PASSWORD: "kunal",
} as const;

function asNonEmpty(value: string | undefined, fallback: string) {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function asValidUrl(value: string | undefined, fallback: string) {
  const v = asNonEmpty(value, fallback);
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return v;
    return fallback;
  } catch {
    return fallback;
  }
}

function asSecret(value: string | undefined, fallback: string) {
  const v = asNonEmpty(value, fallback);
  return v.length >= 16 ? v : fallback;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: asValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, FALLBACKS.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: asNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, FALLBACKS.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: asNonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY, FALLBACKS.SUPABASE_SERVICE_ROLE_KEY),
  SESSION_SECRET: asSecret(process.env.SESSION_SECRET, FALLBACKS.SESSION_SECRET),
  ADMIN_PASSWORD: asNonEmpty(process.env.ADMIN_PASSWORD, FALLBACKS.ADMIN_PASSWORD),
};

function isFallbackValue(key: keyof typeof FALLBACKS, value: string) {
  return value === FALLBACKS[key];
}

export const isSupabaseConfigured =
  !isFallbackValue("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL) &&
  !isFallbackValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  !isFallbackValue("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);
