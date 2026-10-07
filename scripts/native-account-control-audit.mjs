import fs from 'node:fs';

const required=[
  'apps/consumer-mobile/services/account.ts',
  'apps/consumer-mobile/app/account-deletion.tsx',
  'apps/consumer-mobile/app/profile.tsx',
  'apps/consumer-mobile/app/_layout.tsx',
  'supabase/migrations/20260831020500_mobile_account_deletion_execution_boundary.sql',
];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing native account-control file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const screen=fs.readFileSync(required[1],'utf8');
  const profile=fs.readFileSync(required[2],'utf8');
  const signup=fs.readFileSync('apps/consumer-mobile/app/signup.tsx','utf8');
  const layout=fs.readFileSync(required[3],'utf8');
  const migration=fs.readFileSync(required[4],'utf8');
  if(!service.includes("rpc('request_account_deletion'")) failures.push('Account deletion must use the canonical protected request RPC.');
  if(/from\(['"]account_deletion_requests['"]\).*(?:insert|update|delete)/s.test(service+screen+profile)) failures.push('Mobile client must not mutate account_deletion_requests directly.');
  if(/auth\.admin|deleteUser\(/.test(service+screen+profile)) failures.push('Mobile client must not perform privileged auth deletion.');
  if(!screen.includes('I understand that I am requesting deletion')||!screen.includes('disabled={!confirmed||busy}')) failures.push('Account deletion UI must require an explicit confirmation before submission.');
  if(!screen.includes('requestAccountDeletion')||!screen.includes('Optional reason')) failures.push('Account deletion UI must submit through the protected service and allow an optional reason.');
  if(!profile.includes("router.push('/account-deletion')")||!profile.includes('Account deletion request')) failures.push('Profile must expose the in-app account deletion request flow.');
  if(!signup.includes('resetPasswordForEmail')||!signup.includes('FORGOT PASSWORD?')) failures.push('Consumer sign-in must expose a visible self-service password reset request.');
  if(!signup.includes('returnTo')||!signup.includes('safeAuthReturnPath')||!signup.includes('router.replace(returnTo as any)')) failures.push('Consumer sign-in must preserve a safe return path instead of always dumping authenticated users on Home.');
  if(!profile.includes('returnTo')||!profile.includes('safeAuthReturnPath')||!profile.includes('finishAuthenticated(returnTo)')) failures.push('Profile auth and OAuth callbacks must preserve the originating consumer route.');
  if(!profile.includes("event==='PASSWORD_RECOVERY'")||!profile.includes('Set your new password')) failures.push('Consumer Profile must keep password recovery in-app and expose a new-password completion state.');
  const hiddenRoute=/name=["']account-deletion["'][^>]*options=\{\{[^}]*href\s*:\s*null/.test(layout);
  if(!hiddenRoute) failures.push('Account deletion must remain a hidden account-control route, not a primary tab.');
  if(!migration.includes('revoke all on function public.request_account_deletion(text) from public, anon')||!migration.includes('grant execute on function public.request_account_deletion(text) to authenticated')) failures.push('Account deletion RPC execution must be restricted to authenticated users.');
}
if(failures.length){console.error('Native account-control audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native account-control audit passed.');
