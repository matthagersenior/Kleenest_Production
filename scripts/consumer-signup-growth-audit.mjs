import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
const marketing = read('apps/consumer-mobile/components/MarketingSitePro.tsx');
const nativeSignup = read('apps/consumer-mobile/app/signup.tsx');
const guestInvite = read('apps/consumer-mobile/components/GuestInstallUpsell.tsx');
const webProfile = read('src/runtime/ProfilePage.jsx');
const webIdentity = read('src/services/identity.js');
const ownerTally = read('apps/platform-mobile/components/UserTallyPanel.tsx');
const funnelMigration = read('supabase/migrations/20261030030655_owner_consumer_signup_funnel.sql');

test('landing prioritizes free account with guest and install access intact', () => {
  const home = marketing.split('export function MarketingHome()')[1].split('export function MarketingAboutPage()')[0];
  assert.match(home, /CREATE FREE ACCOUNT/);
  assert.match(home, /go\('\/signup'\)/);
  assert.match(home, /TRY AS GUEST/);
  assert.match(home, /go\('\/explore\?app=1'\)/);
  assert.match(home, /go\('\/install'\)/);
  assert.ok(home.indexOf('CREATE FREE ACCOUNT') < home.indexOf('TRY AS GUEST'));
});

test('signup records submission, session creation, confirmation and failure without contact details', () => {
  for (const stage of ["stage:'view'", "stage:'submitted'", "stage:'confirmed_session'", "stage:'confirmation_required'", "stage:'failed'", "stage:'google_started'", "stage:'google_failed'"]) {
    assert.ok(nativeSignup.includes(stage), `Missing signup funnel stage ${stage}`);
  }
  assert.ok(nativeSignup.indexOf("CREATE FREE ACCOUNT") < nativeSignup.indexOf("{(saveIntent||mode==='signup')?"));
  assert.match(nativeSignup, /continueGuest/);
  assert.ok(!nativeSignup.includes('metadata:{email'));
  assert.ok(!nativeSignup.includes('metadata:{password'));
});

test('legacy web users can register and return through the deployed app base path', () => {
  assert.match(webProfile, /identity\.signUp\(/);
  assert.match(webProfile, /Resend confirmation email/);
  assert.match(webProfile, /explore as a guest/);
  assert.match(webIdentity, /import\.meta\.env\.BASE_URL/);
  assert.match(webIdentity, /redirectUrl\('\/profile'\)/);
});

test('successful guest discovery can produce a tagged referral', () => {
  assert.match(guestInvite, /guest_referral/);
  assert.match(guestInvite, /word_of_mouth/);
  assert.match(guestInvite, /Share Kleenest/);
  assert.match(guestInvite, /navigator\.share/);
  assert.match(guestInvite, /Share\.share/);
});

test('owner conversion funnel is aggregated, authorized, and distinguishes real accounts', () => {
  assert.match(ownerTally, /owner_consumer_signup_funnel/);
  assert.match(ownerTally, /Actual new accounts/);
  assert.match(ownerTally, /Install requests/);
  assert.match(ownerTally, /Installed app evidence/);
  assert.match(funnelMigration, /auth\.uid\(\) is null or not public\.is_platform_owner_session\(\)/);
  assert.match(funnelMigration, /revoke all on function private\.owner_consumer_signup_funnel/);
  assert.match(funnelMigration, /security invoker/);
  assert.match(funnelMigration, /registered_accounts_created/);
  assert.ok(!funnelMigration.includes('user_email'));
});
