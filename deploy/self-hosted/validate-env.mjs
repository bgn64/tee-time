import { createHmac, timingSafeEqual } from 'node:crypto';

const env = process.env;
const errors = [];

function requireValue(name, minimum = 1) {
  const value = env[name] ?? '';
  if (value.length < minimum || /your-|configure-|example\.invalid|insecure|fake_/i.test(value)) {
    errors.push(`${name} must be configured with a non-placeholder value.`);
  }
  return value;
}

for (const name of ['SITE_URL', 'SUPABASE_PUBLIC_URL']) {
  const value = requireValue(name);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash ||
        url.username || url.password || value.endsWith('/')) {
      errors.push(`${name} must be an HTTPS origin without a trailing slash.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}
if (env.API_EXTERNAL_URL !== `${env.SUPABASE_PUBLIC_URL}/auth/v1`) {
  errors.push('API_EXTERNAL_URL must equal SUPABASE_PUBLIC_URL followed by /auth/v1.');
}
if (env.SITE_URL === env.SUPABASE_PUBLIC_URL) {
  errors.push('Use separate website and API hostnames.');
}

const password = requireValue('POSTGRES_PASSWORD', 24);
if (!/^[a-zA-Z0-9_~-]+$/.test(password)) {
  errors.push('POSTGRES_PASSWORD must be URL-safe for the official service connection strings.');
}
requireValue('DASHBOARD_PASSWORD', 24);
requireValue('SECRET_KEY_BASE', 64);
requireValue('PG_META_CRYPTO_KEY', 32);
if (requireValue('REALTIME_DB_ENC_KEY').length !== 16) {
  errors.push('REALTIME_DB_ENC_KEY must be exactly 16 characters.');
}
if (requireValue('VAULT_ENC_KEY').length !== 32) {
  errors.push('VAULT_ENC_KEY must be exactly 32 characters.');
}

const secret = requireValue('JWT_SECRET', 32);
for (const [name, role] of [['ANON_KEY', 'anon'], ['SERVICE_ROLE_KEY', 'service_role']]) {
  const value = requireValue(name);
  try {
    const parts = value.split('.');
    if (parts.length !== 3) throw new Error('Expected a JWT');
    const [header, payload, signature] = parts;
    const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const algorithm = JSON.parse(Buffer.from(header, 'base64url').toString()).alg;
    if (algorithm !== 'HS256' || claims.role !== role ||
        !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000 ||
        actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error('Invalid API key');
    }
  } catch {
    errors.push(`${name} must be an unexpired ${role} JWT signed by JWT_SECRET.`);
  }
}

requireValue('SMTP_HOST');
requireValue('SMTP_USER');
requireValue('SMTP_PASS');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(requireValue('SMTP_ADMIN_EMAIL'))) {
  errors.push('SMTP_ADMIN_EMAIL must be a sender email address.');
}
const port = Number(requireValue('SMTP_PORT'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  errors.push('SMTP_PORT must be a valid port.');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Configuration validated. SMTP delivery and public routing still need a live test.');
}
