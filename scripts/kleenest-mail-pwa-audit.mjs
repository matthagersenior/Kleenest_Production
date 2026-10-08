import fs from 'node:fs';
const missing = [];
const read = p => fs.existsSync(p) ? fs.readFileSync(p,'utf8') : '';
function check(condition, label) { if(!condition) missing.push(label); }
const source = read('apps/mail-client/src/main.jsx');
const sw = read('apps/mail-client/public/sw.js');
const html = read('apps/mail-client/dist/index.html');
const manifest = JSON.parse(read('apps/mail-client/dist/manifest.webmanifest') || '{}');
const api = read('supabase/functions/owner-email-center/index.ts');
const workflow = read('.github/workflows/publish-standalone-installer.yml');
for(const token of ["'list_mailboxes'","'list_threads'","'get_thread'","'send'","'reply'","'forward'","'save_draft'","'trash'","'spam'","'set_read'","'star'","'set_label'","'archive'"])check(source.includes(token),'mail app action '+token);
check(source.includes('signInWithPassword') && source.includes('resetPasswordForEmail'), 'password sign-in/reset');
check(source.includes('auth.getSession') && source.includes('access_token'), 'session authentication');
check(!source.includes('SERVICE_ROLE_KEY')&&!source.includes('sb_secret_'),'no privileged keys in browser');
check(api.includes("else if(mailbox==='archive')"),'archive backend support');
check(api.includes("No Kleenest mailbox is assigned"),'non-admin member authentication');
check(api.includes("action==='get_attachment'")&&api.includes('requireMailboxAccess'),'scoped authenticated attachment retrieval');
check(sw.includes("request.method!=='GET'")&&!sw.includes('/functions/v1'),'cache excludes private function calls');
check(manifest.display==='standalone'&&manifest.scope==='./','installable scoped manifest');
check(html.includes('Kleenest Mail'),'PWA index built');
check(workflow.includes('apps/consumer-mobile/dist/mail/'),'publisher includes independent mail client');
for(const f of ['index.html','sw.js','manifest.webmanifest','app-icon.png','app-icon-512.svg'])check(fs.existsSync('apps/mail-client/dist/'+f),'mail build artifact '+f);
if(missing.length){console.error('Kleenest Mail PWA audit failed: '+missing.join('; '));process.exit(1)}
console.log('Kleenest Mail PWA audit passed: standalone build, mailbox controls, auth boundaries, offline cache, and publish path.');
