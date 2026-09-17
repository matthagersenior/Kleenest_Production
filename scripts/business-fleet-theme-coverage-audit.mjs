import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const requireTokens=(label,path,tokens)=>{
  const source=read(path);
  for(const token of tokens)if(!source.includes(token))failures.push(label+' missing '+token+' in '+path);
};

requireTokens('Business Team theme coverage','apps/business-mobile/app/team.tsx',['useBusinessTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Business Workspace selector theme coverage','apps/business-mobile/app/workspaces.tsx',['useBusinessTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Business Account deep theme coverage','apps/business-mobile/app/account.tsx',['theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent','theme.danger']);
requireTokens('Business Analytics deep theme coverage','apps/business-mobile/components/BusinessAnalyticsDashboard.tsx',['useBusinessTheme','theme.canvas','theme.surfaceRaised','theme.ink','theme.muted','theme.line']);
requireTokens('Business Action Center deep theme coverage','apps/business-mobile/app/tools.tsx',['useBusinessTheme','theme.canvas','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Business Team title registration','apps/business-mobile/app/_layout.tsx',["name=\"team\"","title:'Team'"]);

requireTokens('Fleet Home deep theme coverage','apps/fleet-mobile/app/index.tsx',['useFleetTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Fleet Workspace selector theme coverage','apps/fleet-mobile/app/workspaces.tsx',['useFleetTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Fleet Account deep theme coverage','apps/fleet-mobile/app/account.tsx',['theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent','theme.danger']);
requireTokens('Fleet Member deep theme coverage','apps/fleet-mobile/app/member.tsx',['useFleetTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Fleet Nearby deep theme coverage','apps/fleet-mobile/app/nearby.tsx',['useFleetTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Fleet Assets deep theme coverage','apps/fleet-mobile/app/assets.tsx',['useFleetTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Fleet Operations deep theme coverage','apps/fleet-mobile/app/operations.tsx',['useFleetTheme','theme.canvas','theme.surface','theme.surfaceRaised','theme.ink','theme.muted','theme.accent']);
requireTokens('Fleet Notifications deep theme coverage','apps/fleet-mobile/app/notifications.tsx',['useFleetTheme','theme.canvas','theme.surface','theme.ink','theme.muted','theme.accent']);

if(failures.length){
  console.error('Business/Fleet theme coverage audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Business/Fleet theme coverage audit passed.');
