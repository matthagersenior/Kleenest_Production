import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const all=(label,source,tokens)=>tokens.forEach(token=>must(source.includes(token),`${label}: missing ${token}`));

const offline=read('apps/fleet-mobile/services/offline.ts');
const sync=read('apps/fleet-mobile/app/sync.tsx');
const execution=read('apps/fleet-mobile/app/execution.tsx');
must(Boolean(offline),'Fleet offline recovery service is missing');
must(Boolean(sync),'Fleet sync operating surface is missing');
must(Boolean(execution),'Fleet field execution surface is missing');

all('Durable queue persistence',offline,[
  "const KEY='kleenest.fleet.offline.route-stop.v2'",
  "const LEGACY_KEY='kleenest.fleet.offline.route-stop.v1'",
  'AsyncStorage.getItem(KEY)',
  'AsyncStorage.setItem(KEY',
  'AsyncStorage.removeItem(LEGACY_KEY)',
  'schemaVersion:2',
  'occurredAt',
  'attempts',
  'lastError'
]);
all('Server-authorized replay pack lifecycle',offline,[
  "rpc('create_offline_pack'",
  "p_pack_type:'business'",
  'p_business_id:businessId',
  'p_expires_hours:168',
  'prepareFleetOfflinePack',
  'cachedReplayPack',
  'createReplayPack'
]);
all('Idempotent replay contract',offline,[
  "rpc('fleet_replay_route_stop_timing'",
  'p_pack_id:packId',
  'p_client_event_id:row.id',
  'already_synced',
  'alreadySynced++'
]);
all('Expired or invalid pack recovery',offline,[
  'packError',
  'offline pack access denied',
  'packId=await createReplayPack(row.businessId)',
  'result=await replayOne(row,packId)'
]);
all('Failed replay durability',offline,[
  'remaining.push({...row',
  'attempts:row.attempts+1',
  'lastError:result.error.message',
  'await write(remaining)'
]);
// The old broken implementation invented a local UUID for packId. Never allow that shape back.
must(!offline.includes('packId:uuid()'),'Fleet offline replay must never invent a server pack UUID locally');
must(!/rows\.push\(\{id:uuid\(\),packId:uuid\(\)/.test(offline),'Fleet offline queue regressed to locally fabricated pack IDs');
// Stable client event IDs must be preserved through replay; do not regenerate during retry.
must(!/p_client_event_id\s*:\s*uuid\(\)/.test(offline),'Fleet replay must reuse the persisted client event ID for deduplication');

all('Field execution integration',execution,['recordOrQueueRouteStopTiming','replayOfflineRouteEvents']);
all('Operator recovery visibility',sync,[
  'Device offline queue',
  'Replay queued field events',
  'Prepare replay pack',
  'Last replay error',
  'alreadySynced',
  'Server replay pack assigned',
  'client '
]);

if(failures.length){console.error(`Fleet offline recovery audit failed with ${failures.length} issue${failures.length===1?'':'s'}:`);failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}
console.log('Fleet offline recovery audit passed: device persistence, real server pack ownership, stable client-event idempotency, pack renewal, retry durability and operator visibility are protected.');
