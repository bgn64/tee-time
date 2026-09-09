import { execSync, spawn } from 'node:child_process';

type SupabaseStatus = {
  ANON_KEY?: string;
  API_URL?: string;
  MAILPIT_URL?: string;
  STUDIO_URL?: string;
};

function readSupabaseStatus(): SupabaseStatus {
  const output = execSync('supabase status -o json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(output) as SupabaseStatus;
}

const status = readSupabaseStatus();
if (!status.API_URL || !status.ANON_KEY) {
  throw new Error('Local Supabase did not report API_URL and ANON_KEY.');
}

console.log('');
console.log('Tee Time local services');
console.log(`  App:     http://localhost:8081`);
console.log(`  Studio:  ${status.STUDIO_URL ?? 'unavailable'}`);
console.log(`  Mailpit: ${status.MAILPIT_URL ?? 'unavailable'}`);
console.log('  Login:   dev@tee-time.test');
console.log('');

const expo = spawn('expo start --web --port 8081', {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  },
});

expo.on('error', (error) => {
  console.error('Could not start Expo.', error);
  process.exitCode = 1;
});

expo.on('exit', (code) => {
  process.exitCode = code ?? 0;
});