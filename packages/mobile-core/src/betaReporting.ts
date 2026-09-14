import { getKleenestSupabaseClient } from './index';

export type BetaIncidentStatus='new'|'reproduced'|'investigating'|'fixed'|'shipped';
export type BetaReportKind='manual'|'automatic';
export type BetaReportCategory='bug'|'glitch'|'network'|'data'|'performance'|'feedback'|'crash'|'other';

export type BetaReportInput={
  fingerprint:string;
  appSurface:'consumer'|'business'|'fleet'|'owner'|'web';
  reportKind:BetaReportKind;
  category:BetaReportCategory;
  message:string;
  sessionId:string;
  route?:string|null;
  appVersion?:string|null;
  runtimeVersion?:string|null;
  updateId?:string|null;
  platform?:string|null;
  platformVersion?:string|null;
  metadata?:Record<string,unknown>;
  breadcrumbs?:unknown[];
};

export type BetaReportReceipt={
  incident_id:string;
  status:BetaIncidentStatus;
  occurrence_count:number;
  created?:boolean;
};

export type BetaIncident={
  id:string;
  fingerprint:string;
  app_surface:string;
  category:string;
  title:string;
  status:BetaIncidentStatus;
  occurrence_count:number;
  first_seen:string;
  last_seen:string;
  last_route:string|null;
  last_app_version:string|null;
  last_runtime_version:string|null;
  last_error:string|null;
  sample_metadata:Record<string,unknown>|null;
  created_at:string;
  updated_at:string;
};

export type BetaReportEvent={
  id:string;
  incident_id:string;
  user_id:string|null;
  session_id:string;
  report_kind:BetaReportKind;
  category:string;
  message:string;
  route:string|null;
  app_surface:string;
  app_version:string|null;
  runtime_version:string|null;
  update_id:string|null;
  platform:string|null;
  platform_version:string|null;
  metadata:Record<string,unknown>|null;
  breadcrumbs:unknown[]|null;
  created_at:string;
};

export async function submitBetaDiagnosticReport(input:BetaReportInput){
  const {data,error}=await getKleenestSupabaseClient().rpc('submit_beta_report',{
    p_fingerprint:input.fingerprint,
    p_app_surface:input.appSurface,
    p_report_kind:input.reportKind,
    p_category:input.category,
    p_message:input.message,
    p_session_id:input.sessionId,
    p_route:input.route||null,
    p_app_version:input.appVersion||null,
    p_runtime_version:input.runtimeVersion||null,
    p_update_id:input.updateId||null,
    p_platform:input.platform||null,
    p_platform_version:input.platformVersion||null,
    p_metadata:input.metadata||{},
    p_breadcrumbs:input.breadcrumbs||[],
  });
  if(error)throw error;
  return (data||{}) as BetaReportReceipt;
}

export async function listOwnerBetaIncidents(limit=100,status:BetaIncidentStatus|null=null){
  const {data,error}=await getKleenestSupabaseClient().rpc('owner_list_beta_incidents',{
    p_limit:Math.min(Math.max(limit,1),500),
    p_status:status,
  });
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as BetaIncident[];
}

export async function listOwnerBetaReportEvents(incidentId:string,limit=50){
  const {data,error}=await getKleenestSupabaseClient().rpc('owner_list_beta_report_events',{
    p_incident_id:incidentId,
    p_limit:Math.min(Math.max(limit,1),200),
  });
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as BetaReportEvent[];
}

export async function setOwnerBetaIncidentStatus(incidentId:string,status:BetaIncidentStatus){
  const {data,error}=await getKleenestSupabaseClient().rpc('owner_set_beta_incident_status',{
    p_incident_id:incidentId,
    p_status:status,
  });
  if(error)throw error;
  return data as {incident_id:string;status:BetaIncidentStatus;occurrence_count:number;updated_at?:string};
}
