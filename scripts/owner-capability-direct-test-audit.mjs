import fs from 'node:fs';

const path='apps/platform-mobile/app/control.tsx';
if(!fs.existsSync(path)) throw new Error('Missing KleenestOS Control Center.');
const text=fs.readFileSync(path,'utf8');
for(const [needle,message] of [
  ['capabilityTarget','Control Center must resolve governed capability launch targets.'],
  ['kleenest://','Consumer capability launch scheme is required.'],
  ['kleenest-business://','Business capability launch scheme is required.'],
  ['kleenest-fleet://','Fleet capability launch scheme is required.'],
  ['kleenest-owner://','KleenestOS capability launch scheme is required.'],
  ['Open capability','Capability cards must expose a direct test/open action.'],
  ['domain.owner_route','Capability launch must use canonical owner routes.'],
  ['domain.rpc_exists','Capability launch must remain gated by canonical RPC existence.'],
]) if(!text.includes(needle)) throw new Error(message);
console.log('KleenestOS direct capability-test audit passed.');
