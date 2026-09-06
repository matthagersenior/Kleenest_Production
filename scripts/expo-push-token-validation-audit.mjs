import fs from 'node:fs';

const repairPath='supabase/migrations/20260906194000_repair_expo_push_token_validation.sql';
const failures=[];

if(!fs.existsSync(repairPath)){
  failures.push(`missing Expo push validation repair migration: ${repairPath}`);
}else{
  const sql=fs.readFileSync(repairPath,'utf8');
  const validPattern=String.raw`^Expo(nent)?PushToken\[[^]]+\]$`;
  const overEscapedPattern=String.raw`^Expo(nent)?PushToken\\[[^]]+\\]$`;
  if(!sql.includes(validPattern))failures.push('Expo push validation must accept ExpoPushToken[...] and ExponentPushToken[...]');
  if(sql.includes(overEscapedPattern))failures.push('Expo push validation must not double-escape bracket delimiters');
  if(!sql.includes("set search_path = ''"))failures.push('push token registration must retain an empty security-definer search path');
  if(!sql.includes("grant execute on function public.register_notification_native_push_token(text,text,text) to authenticated"))failures.push('push token registration must remain authenticated-only');
}

if(failures.length){
  console.error('Expo push token validation audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Expo push token validation audit passed.');
