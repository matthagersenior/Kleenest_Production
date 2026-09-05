import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing Owner runtime contract file: ${path}`);return read(path)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

const messaging=requireFile('apps/platform-mobile/app/notifications.tsx');
const home=requireFile('apps/platform-mobile/app/index.tsx');
const ownerAdmin=requireFile('apps/platform-mobile/services/ownerAdmin.ts');
const migration=requireFile('supabase/migrations/20260905221500_repair_owner_runtime_observability_and_audit_contracts.sql');
const compatibility=requireFile('supabase/migrations/20260905222500_align_owner_mobile_runtime_compatibility.sql');
const smoke=requireFile('scripts/android-startup-smoke.sh');

requireAll('Owner Messaging crash containment',messaging,[
  'export function ErrorBoundary',
  "await import('../services/push')",
  'normalizeRule',
  'listRows(data?.rules)',
  'Loading Live Network messaging',
]);
must(!messaging.includes("import { registerRolePush } from '../services/push'"),'Owner Messaging must not eagerly initialize the native notifications module on route import.');

requireAll('Owner telemetry presentation',home,[
  'getIngestionControlSnapshot',
  'storage_guard',
  'observed_percent',
  'disk_observed_percent',
  'wal_bytes',
]);
requireAll('Owner audit client',ownerAdmin,[
  "rpc('admin_list_activity_events'",
  'p_from:start.toISOString()',
  'p_to:end.toISOString()',
]);

requireAll('Owner backend observability repair',migration,[
  'select c.* from classified c where c.classification',
  'admin_list_activity_events_window',
  "'storage_guard',coalesce(v_status->'storage_guard'",
]);
requireAll('Owner installed-client compatibility',compatibility,[
  'public.admin_list_activity_events(',
  'p_from timestamptz',
  'p_to timestamptz',
  "from public.national_ingestion_runs r",
  "r.status='running' and r.started_at>=now()-interval '30 minutes'",
  "'{markets,marked_running}'",
  "'{markets,stale_running}'",
  "'{markets,running}'",
]);

requireAll('Owner Android route smoke',smoke,[
  'com.kleenest.platform',
  'kleenest-owner://notifications',
  'uiautomator dump',
  'Owner Live Network Messaging did not render visible content after deep link',
  'ReactNativeJS.*(TypeError|ReferenceError|Invariant Violation|Unhandled JS Exception)',
]);

if(failures.length){console.error(`Owner runtime integrity audit failed with ${failures.length} gap(s):`);failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}
console.log('Owner runtime integrity audit passed: live telemetry, audit RPC compatibility, capability retirement SQL, Messaging crash containment and Android route smoke are protected.');
