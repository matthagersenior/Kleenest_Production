export type BusinessActionGroup='Today'|'Locations'|'Trust & Operations'|'Growth & QR'|'Insights'|'Enterprise'|'Team & Admin';

export type BusinessActionDefinition={
  id:string;
  title:string;
  description:string;
  route:string;
  group:BusinessActionGroup;
  serviceActions:string[];
  keywords?:string[];
};

export const BUSINESS_ACTIONS:BusinessActionDefinition[]=[
  {id:'workspace',title:'Switch business workspace',description:'Move between businesses you are authorized to operate.',route:'/workspaces',group:'Team & Admin',serviceActions:['selectBusinessWorkspace']},
  {id:'profile',title:'Update business profile',description:'Manage the identity and brand shown across Kleenest.',route:'/profile',group:'Team & Admin',serviceActions:['updateBusinessProfile']},
  {id:'location-manage',title:'Create, edit or deactivate locations',description:'Operate canonical Business locations without creating duplicates.',route:'/locations',group:'Locations',serviceActions:['manageBusinessLocation','claimLocation','pickAndUploadBusinessLocationPhoto']},
  {id:'location-enterprise',title:'Configure Enterprise locations',description:'Set location-level Enterprise configuration and staff authority.',route:'/enterprise-location-admin',group:'Enterprise',serviceActions:['updateEnterpriseLocationConfig','manageEnterpriseLocationStaff']},
  {id:'team',title:'Manage people and roles',description:'Invite staff, change roles, remove access or transfer ownership.',route:'/members',group:'Team & Admin',serviceActions:['inviteBusinessMember','changeBusinessMemberRole','removeBusinessMember','transferBusinessOwnership']},
  {id:'reviews',title:'Respond to reviews',description:'Review evidence and publish the Business response.',route:'/reviews',group:'Trust & Operations',serviceActions:['replyBusinessReview','replyToReview']},
  {id:'remediation',title:'Resolve remediation work',description:'Move restroom issues through action, proof and completion.',route:'/trust-operations',group:'Trust & Operations',serviceActions:['manageRemediation','manageRemediationCase','pickAndUploadRemediationProof']},
  {id:'reverification',title:'Manage reverification',description:'Request and resolve fresh verification, including QR-driven reverification.',route:'/trust-operations',group:'Trust & Operations',serviceActions:['manageReverification','manageReverificationCase','createReverificationQr']},
  {id:'prevention',title:'Run preventive operations',description:'Create/update preventive work and attach it to Fleet routes.',route:'/prevention',group:'Trust & Operations',serviceActions:['managePreventiveWorkOrder','attachPreventiveWorkToRoute']},
  {id:'promotion',title:'Manage promotions',description:'Create, edit, activate and retire customer promotions.',route:'/engagement',group:'Growth & QR',serviceActions:['managePromotion','manageBusinessPromotion','setPromotionActive']},
  {id:'campaign',title:'Manage campaigns',description:'Build and operate measurable customer campaigns.',route:'/engagement',group:'Growth & QR',serviceActions:['manageCampaign','manageBusinessCampaign']},
  {id:'contest',title:'Manage contests',description:'Create and operate Kleenest-linked contests.',route:'/engagement',group:'Growth & QR',serviceActions:['manageContest','manageBusinessContest']},
  {id:'event',title:'Manage events',description:'Create and operate events connected to Business locations.',route:'/engagement',group:'Growth & QR',serviceActions:['manageEvent','manageBusinessEvent','createBusinessEvent']},
  {id:'media',title:'Manage business media',description:'Create, update and remove Business media used by customer-facing experiences.',route:'/growth',group:'Growth & QR',serviceActions:['createBusinessMedia','updateBusinessMedia','deleteBusinessMedia','setBusinessLocationConsumerPhoto']},
  {id:'qr-library',title:'Create and operate QR programs',description:'Create QR programs/assets, edit lifecycle state and manage attribution.',route:'/qr-studio',group:'Growth & QR',serviceActions:['createQrProgram','createQrAsset','updateQrAsset','setQrActive','deleteQrAsset','manageBusinessQr','createCustomQr','upsertQrAsset']},
  {id:'qr-design',title:'Design and version QR experiences',description:'Brand QR assets, save versions/templates and restore prior designs.',route:'/qr-designer',group:'Growth & QR',serviceActions:['saveQrVisualDesign','saveQrTemplate','archiveQrTemplate','restoreQrVersion','saveQrVersion','pickAndUploadQrBranding','deleteQrBranding']},
  {id:'live-network',title:'Operate Live Network',description:'Configure geofences, permissions, push delivery and live location workflows.',route:'/live-network',group:'Today',serviceActions:['configureLiveNetworkGeofence','ensureLiveNetworkGeofences','ensureBusinessGeofences','requestLiveNetworkForegroundPermission','requestLiveNetworkBackgroundPermission','startLiveNetworkGeofencing','disableLiveNetwork','registerLiveNetworkPush','registerRolePush']},
  {id:'notify',title:'Send Business notifications',description:'Send approved Business communication to the relevant audience.',route:'/notifications',group:'Today',serviceActions:['sendBusinessNotification']},
  {id:'intelligence-actions',title:'Execute intelligence actions',description:'Turn intelligence recommendations into tracked Business actions.',route:'/intelligence',group:'Insights',serviceActions:['executeIntelligenceAction','completeIntelligenceAction']},
  {id:'reports',title:'Schedule and run reporting',description:'Create weekly schedules, enable/disable them and run due reports.',route:'/governance',group:'Insights',serviceActions:['createWeeklyBusinessReportSchedule','setReportingScheduleEnabled','deleteReportingSchedule','runDueReportingSchedules']},
  {id:'assistant',title:'Run Kleenest AI',description:'Use live Business context for operating, growth and communication assistance.',route:'/assistant',group:'Insights',serviceActions:['runBusinessAi']},
  {id:'partners',title:'Manage partner programs',description:'Create partner programs and Business partnerships.',route:'/partners',group:'Enterprise',serviceActions:['createPartnerProgram','updatePartnerProgram','deletePartnerProgram','createPartnership','updatePartnership','deletePartnership']},
  {id:'enterprise-network',title:'Manage Enterprise networks',description:'Create, update or retire partner networks and control partner status.',route:'/enterprise',group:'Enterprise',serviceActions:['createEnterpriseNetwork','updateEnterpriseNetwork','deleteEnterpriseNetwork','inviteEnterprisePartner','setEnterprisePartnerStatus']},
  {id:'enterprise-campaign',title:'Operate Enterprise campaigns',description:'Create, edit, activate, pause and close network campaigns.',route:'/enterprise',group:'Enterprise',serviceActions:['createEnterpriseCampaign','updateEnterpriseCampaign','activateEnterpriseCampaign','pauseEnterpriseCampaign','deleteEnterpriseCampaign','recordEnterpriseCampaignOutcome']},
  {id:'enterprise-economy',title:'Manage partner allocations',description:'Create and activate Enterprise partner allocations tied to measurable ROI.',route:'/enterprise-economy',group:'Enterprise',serviceActions:['createPartnerAllocation','activatePartnerAllocation']},
  {id:'onboarding',title:'Configure Business experience',description:'Preview and apply the operating profile used to prioritize the workspace.',route:'/onboarding',group:'Team & Admin',serviceActions:['previewBusinessOnboarding','applyBusinessOnboarding']},
  {id:'demo',title:'Run the real-world demo loop',description:'Start, advance or reset the deterministic Business demo experience.',route:'/demo',group:'Team & Admin',serviceActions:['startBusinessRealWorldDemoLoop','advanceBusinessRealWorldDemoLoop','resetBusinessRealWorldDemoLoop']},
];

export const BUSINESS_ACTION_GROUPS:BusinessActionGroup[]=['Today','Locations','Trust & Operations','Growth & QR','Insights','Enterprise','Team & Admin'];
