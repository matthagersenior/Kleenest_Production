import fs from 'node:fs';

const failures=[];
const required=[
  'supabase/migrations/20260913143000_smart_device_control_plane.sql',
  'supabase/migrations/20260913134913_smart_restroom_amenity_ecosystem_convergence.sql',
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
  'supabase/functions/platform-api/index.ts',
  'apps/consumer-mobile/services/amenities.ts',
  'apps/consumer-mobile/app/discover.tsx',
  'apps/consumer-mobile/services/qrActions.ts',
  'apps/business-mobile/app/qr-studio.tsx',
  'apps/business-mobile/app/growth.tsx',
  'apps/business-mobile/app/fleet.tsx',
  'apps/business-mobile/app/enterprise.tsx',
  'apps/developer-portal/src/App.tsx',
  'docs/platform/openapi-v1.json'
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
requireTokens('supabase/migrations/20260913134913_smart_restroom_amenity_ecosystem_convergence.sql',['Connected / Smart Restroom','location_smart_restroom_state','business_set_location_amenity','business_smart_amenity_snapshot','business_create_smart_restroom_qr','execute_smart_device_qr_action','place.amenities_changed']);
requireTokens('supabase/functions/smart-device-gateway/index.ts',[
  'record_smart_device_event','claim_smart_device_commands','complete_smart_device_command',
  'x-kleenest-api-key','AbortSignal.timeout'
]);
requireTokens('apps/business-mobile/services/smartDevices.ts',[
  'smart_device_manifest','smart_device_command','smart_device_set_automation_rule','smartRestroomSnapshot','setSmartRestroomAmenity','createSmartRestroomQr'
]);
requireTokens('apps/business-mobile/app/devices.tsx',[
  'Smart Devices','Connected / Smart Restroom amenity','Create verification QR','Create QR','Automation','Device health'
]);
requireTokens('apps/platform-mobile/app/devices.tsx',[
  'IoT & Smart Devices','Command audit','Connector health'
]);
requireTokens('apps/business-mobile/services/actionRegistry.ts',[
  "id:'smart-devices'","route:'/devices'","smartDeviceCommand","setSmartRestroomAmenity","createSmartRestroomQr"
]);
requireTokens('apps/business-mobile/app/_layout.tsx',['name="devices"']);
requireTokens('apps/platform-mobile/app/_layout.tsx',['name="devices"']);
requireTokens('packages/webhook-types/src/index.ts',[
  "'device.status_changed'","'device.alert'","'device.command_completed'","'device.telemetry_threshold'"
]);
requireTokens('mcp/kleenest-mcp/src/index.ts',[
  "'list_smart_devices'","'command_smart_device'","'list_amenities'","'find_smart_restrooms'","'/v1/devices'"
]);
requireTokens('supabase/functions/platform-api/index.ts',[
  "'/v1/devices'","'/v1/devices/'","'/v1/amenities'","smartRestroom","devices:read","devices:command"
]);
requireTokens('apps/developer-portal/src/App.tsx',['Smart Facilities','Connected / Smart Restroom','devices:events:write','place.amenities_changed']);
requireTokens('docs/platform/openapi-v1.json',['/v1/amenities','Smart Facilities','smartRestroom','/v1/devices']);
requireTokens('apps/consumer-mobile/app/discover.tsx',['Connected / Smart Restroom']);
requireTokens('apps/consumer-mobile/services/qrActions.ts',["type==='smart_amenity'"]);
requireTokens('apps/business-mobile/app/qr-studio.tsx',["'smart_amenity'"]);
requireTokens('docs/platform/SMART_DEVICES.md',[
  'Matter','MQTT','vendor cloud','idempotent','least privilege','retention'
]);

if(failures.length){
  console.error('Smart-device control-plane audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Smart-device control-plane audit passed.');
