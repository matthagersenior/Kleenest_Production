import fs from 'node:fs';
const read=file=>fs.readFileSync(file,'utf8');
const app=read('src/runtime/App.jsx');
const profile=read('src/runtime/ProfilePage.jsx');
const hub=read('src/runtime/WorkspacePage.jsx');
const business=read('src/runtime/BusinessWorkspacePage.jsx');
const fleet=read('src/runtime/FleetWorkspacePage.jsx');
const enterprise=read('src/runtime/EnterpriseWorkspacePage.jsx');
const platform=read('src/runtime/PlatformWorkspacePage.jsx');
const service=read('src/services/workspaces.js');
const failures=[];
const checks=[
  [profile.includes("navigate('/workspace')"),'Profile must expose the canonical workspace hub'],
  [app.includes('path="/workspace"')&&app.includes('path="/workspace/business"')&&app.includes('path="/workspace/fleet"')&&app.includes('path="/workspace/enterprise"')&&app.includes('path="/workspace/platform"'),'All role workspaces must route through the canonical runtime'],
  [service.includes("rpc('get_current_user_product_entitlements'"),'Workspace access must consume product entitlement authority'],
  [service.includes("rpc('business_list_workspaces'"),'Business memberships must use business_list_workspaces'],
  [!service.includes("from('businesses')"),'Workspace resolver must not bypass business RPC authority with direct businesses reads'],
  [service.includes("rpc('get_business_product_access'"),'Business workspace must use product access authority'],
  [service.includes("rpc('business_dashboard_secure_summary'"),'Business workspace must use secure dashboard summary'],
  [business.includes('getBusinessWorkspaceOverview'),'Business surface must consume canonical workspace service'],
  [service.includes("rpc('business_fleet_authorized'"),'Fleet workspace must verify Fleet authorization'],
  [service.includes("rpc('fleet_current_user_dispatch'"),'Fleet workspace must use current-user dispatch authority'],
  [fleet.includes('getFleetWorkspaceOverview'),'Fleet surface must consume canonical Fleet service'],
  [service.includes("rpc('business_enterprise_authorized'"),'Enterprise workspace must verify Enterprise authorization'],
  [service.includes("rpc('enterprise_control_plane_snapshot'"),'Enterprise workspace must use control-plane authority'],
  [enterprise.includes('getEnterpriseWorkspaceOverview'),'Enterprise surface must consume canonical Enterprise service'],
  [service.includes('profile.is_platform_owner||profile.is_admin||role===\'admin\''),'Platform access must derive only from owner/admin profile authority'],
  [service.includes("rpc('admin_list_pending_businesses'"),'Platform surface must use admin RPC authority'],
  [platform.includes('getPlatformWorkspaceOverview'),'Platform surface must consume canonical admin service'],
  [hub.includes('context?.access')||hub.includes('context.access'),'Workspace hub must render from resolved access rather than hardcoded roles'],
];
for(const[ok,message]of checks)if(!ok)failures.push(message);
if(failures.length){console.error('Workspace authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}console.log('Workspace authority audit passed.');
