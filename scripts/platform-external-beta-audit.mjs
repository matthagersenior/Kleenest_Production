import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing external beta file: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function requireText(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

const migrationNames = fs.readdirSync('supabase/migrations')
  .filter(name => /platform_external_beta/.test(name))
  .sort();
if (migrationNames.length < 1) throw new Error('Expected external beta onboarding migrations.');
const sql = migrationNames.map(name => file(`supabase/migrations/${name}`)).join('\n');

for (const table of ['platform_partner_members','platform_partner_invites']) {
  requireText(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'), `Missing ${table}.`);
}
for (const fn of [
  'create_platform_partner_invite',
  'claim_platform_partner_invite',
  'platform_user_partner_memberships',
  'platform_member_partner_summary',
  'issue_platform_member_api_key',
  'revoke_platform_member_api_key',
  'create_platform_member_webhook_endpoint',
  'disable_platform_member_webhook_endpoint',
  'enqueue_platform_member_test_webhook',
]) {
  requireText(sql, new RegExp(`function public\\.${fn}`, 'i'), `Missing ${fn}.`);
}
requireText(sql, /digest\(/i, 'Invite tokens must be hashed at rest.');
requireText(sql, /auth\.users/i, 'Partner memberships must bind to authenticated users.');
requireText(sql, /unique\s*\(partner_id\s*,\s*user_id\)/i, 'Partner membership must be unique per user.');

const admin = file('supabase/functions/platform-partner-admin/index.ts');
for (const op of ['create-invite','claim-invite','my-partners']) {
  requireText(admin, new RegExp(op), `Partner admin must support ${op}.`);
}
requireText(admin, /memberRole|partnerMembership|membership/i, 'Partner admin must enforce partner membership for external users.');

const hosted = file('supabase/functions/platform-developer-portal/index.ts');
for (const phrase of ['Create developer account','Claim invite','My partner workspaces']) {
  requireText(hosted, new RegExp(phrase, 'i'), `Hosted developer portal must expose ${phrase}.`);
}
if (/sandboxPartnerId='eba2a7a6-1059-4619-9ae7-318463056ddb'/.test(hosted)) {
  throw new Error('Hosted portal must not be hard-wired to the internal sandbox for external users.');
}

console.log('Kleenest external beta onboarding audit passed.');
