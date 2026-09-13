import fs from 'node:fs';

const failures=[];
const required=[
  'supabase/migrations/20260913143000_smart_device_control_plane.sql',
  'supabase/functions/smart-device-gateway/index.ts',
  'apps/business-mobile/services/smartDevices.ts',
  'apps/business-mobile/app/devices.tsx',
  'apps/platform-mobile/services/smartDevices.ts',
  'apps/platform-mobile/app/devices.tsx',
  'docs/platform/SMART_DEVICES.md',
  'packages/webhook-types/src/index.ts',
  'mcp/kleenest-mcp/src/index.ts',
  'apps/business-mobile/services/actionRegistry.ts',
  'apps/business-mobile/app/_layout.tsx',
  'apps/platform-mobile/app/_layout.tsx',
  'supabase/functions/platform-api/index.ts'
];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing smart-device control-plane file: ${file}`);

function requireTokens(file,tokens){
  if(!fs.existsSync(file)) return;
  const content=fs.readFileSync(file,'utf8');
  for(const token of tokens) if(!content.includes(token)) failures.push(`${file} missing ${token}`);
}

requireTokens('supabase/migrations/20260913143000_smart_device_control_plane.sql',[
  'smart_device_connectors','smart_devices','smart_device_events','smart_device_commands',
  'smart_device_automation_rules','smart_device_command','smart_device_manifest',
  'record_smart_device_event','devices:read','devices:write','devices:command','devices:events:write'
]);
requireTokens('supabase/functions/smart-device-gateway/index.ts',[
  'record_smart_device_event','claim_smart_device_commands','complete_smart_device_command',
  'x-kleenest-api-key','AbortSignal.timeout'
]);
requireTokens('apps/business-mobile/services/smartDevices.ts',[
  'smart_device_manifest','smart_device_command','smart_device_set_automation_rule'
]);
requireTokens('apps/business-mobile/app/devices.tsx',[
  'Smart Devices','Send command','Automation','Device health'
]);
requireTokens('apps/platform-mobile/app/devices.tsx',[
  'IoT & Smart Devices','Command audit','Connector health'
]);
requireTokens('apps/business-mobile/services/actionRegistry.ts',[
  "id:'smart-devices'","route:'/devices'","smartDeviceCommand"
]);
requireTokens('apps/business-mobile/app/_layout.tsx',['name="devices"']);
requireTokens('apps/platform-mobile/app/_layout.tsx',['name="devices"']);
requireTokens('packages/webhook-types/src/index.ts',[
  "'device.status_changed'","'device.alert'","'device.command_completed'","'device.telemetry_threshold'"
]);
requireTokens('mcp/kleenest-mcp/src/index.ts',[
  "'list_smart_devices'","'command_smart_device'","'/v1/devices'"
]);
requireTokens('supabase/functions/platform-api/index.ts',[
  "'/v1/devices'","'/v1/devices/'","devices:read","devices:command"
]);
requireTokens('docs/platform/SMART_DEVICES.md',[
  'Matter','MQTT','vendor cloud','idempotent','least privilege','retention'
]);

if(failures.length){
  console.error('Smart-device control-plane audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Smart-device control-plane audit passed.');
