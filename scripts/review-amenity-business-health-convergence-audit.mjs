import fs from 'node:fs';

const files={
  amenityService:'apps/consumer-mobile/services/amenities.ts',
  evidenceMigration:'supabase/migrations/20260831164500_review_amenity_evidence_convergence.sql',
  healthMigration:'supabase/migrations/20260831164600_business_restroom_health_amenity_evidence.sql',
  workspaces:'src/services/workspaces.js',
  workspacePage:'src/runtime/BusinessWorkspacePage.jsx',
};
const failures=[];
for(const [name,path] of Object.entries(files))if(!fs.existsSync(path))failures.push(`missing ${name}: ${path}`);
if(!failures.length){
 const service=fs.readFileSync(files.amenityService,'utf8');
 const evidence=fs.readFileSync(files.evidenceMigration,'utf8').toLowerCase();
 const health=fs.readFileSync(files.healthMigration,'utf8').toLowerCase();
 const workspaces=fs.readFileSync(files.workspaces,'utf8');
 const page=fs.readFileSync(files.workspacePage,'utf8');
 if(service.includes("rpc('award_review_amenity_progression'"))failures.push('client still triggers amenity progression separately');
 for(const token of ['location_amenity_observations','review_amenity_feedback','award_review_amenity_progression','server_authoritative','canonical_observations'])if(!evidence.includes(token))failures.push(`evidence convergence missing ${token}`);
 for(const token of ['business_restroom_health_score','location_amenity_observations','amenity_attention_observations','v2_amenity_evidence'])if(!health.includes(token))failures.push(`health migration missing ${token}`);
 if(!workspaces.includes("client.rpc('business_restroom_health_score'"))failures.push('business workspace overview does not load restroom health authority');
 for(const token of ['RESTROOM HEALTH','portfolioHealth','attentionSignals','healthRows','health_score','RESTROOM HEALTH DETAIL'])if(!page.includes(token))failures.push(`business health presentation missing ${token}`);
}
if(failures.length){console.error('Review amenity → business health convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Review amenity → canonical trust → business health convergence audit passed.');
