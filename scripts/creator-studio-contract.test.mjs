import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261013230000_creator_studio_invites_and_mission_approvals.sql');
const studio=read('src/runtime/CreatorStudioPage.jsx');
const app=read('src/runtime/App.jsx');
const workspace=read('src/runtime/WorkspacePage.jsx');

test('creator accounts are not admin roles and direct table access is revoked',()=>{
 assert.match(migration,/creator_studio_accounts[\s\S]*?status text/);
 assert.match(migration,/revoke all on public\.creator_studio_accounts from public,anon,authenticated/);
 assert.match(migration,/revoke all on public\.creator_studio_missions from public,anon,authenticated/);
 assert.match(migration,/email_confirmed_at is not null/);
 assert.match(migration,/user_id=u/);
});
test('creator cannot approve or review their own mission',()=>{
 assert.match(migration,/creator_studio_owner_review\(/);
 assert.match(migration,/not public\.is_platform_owner_session\(\)/);
 assert.match(migration,/where id=p_id and status='submitted'/);
 assert.match(migration,/where id=p_id and account_id=a and status in/);
});
test('public shares show approved missions only and do not expose internal review data',()=>{
 assert.match(migration,/m\.status='approved' and a\.status='active'/);
 assert.match(migration,/select jsonb_build_object\('id',m\.id,'title',m\.title/);
 assert.doesNotMatch(migration,/select to_jsonb\(m\)\|\|jsonb_build_object\('creator_name'/);
});
test('creator mission builder supports measurable field tasks with owner-controlled rewards',()=>{
 for(const key of ['places','feedback','photos','amenities','xp'])assert.ok(studio.includes(key));
 assert.match(studio,/Submit for approval/);
 assert.match(studio,/Rewards are not automatically issued/);
 assert.match(app,/\/workspace\/creator-studio/);
 assert.match(app,/\/creator-mission\/:id/);
 assert.match(workspace,/data\?\.authorized/);
});
