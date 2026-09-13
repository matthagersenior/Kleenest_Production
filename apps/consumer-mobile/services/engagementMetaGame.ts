export type KleenestDivision={code:string;name:string;minXp:number;icon:string;description:string};
export const KLEENEST_DIVISIONS:KleenestDivision[]=[
 {code:'scout',name:'Scout',minXp:0,icon:'◌',description:'Learn the network and make useful first contributions.'},
 {code:'pathfinder',name:'Pathfinder',minXp:500,icon:'◇',description:'Build a reliable trail of visits, reviews and discoveries.'},
 {code:'verifier',name:'Verifier',minXp:1500,icon:'◆',description:'Become known for current, specific evidence.'},
 {code:'navigator',name:'Navigator',minXp:3500,icon:'✦',description:'Combine discovery skill, route judgment and community trust.'},
 {code:'guardian',name:'Trust Guardian',minXp:7000,icon:'✪',description:'Protect network quality through high-value verification.'},
 {code:'legend',name:'Kleenest Legend',minXp:12000,icon:'★',description:'Master games, evidence and community contribution at the highest tier.'},
];

export function divisionForXp(xp:number){
 const score=Math.max(0,Number(xp||0));
 return [...KLEENEST_DIVISIONS].reverse().find(d=>score>=d.minXp)||KLEENEST_DIVISIONS[0];
}
export function nextDivisionForXp(xp:number){
 const score=Math.max(0,Number(xp||0));
 return KLEENEST_DIVISIONS.find(d=>d.minXp>score)||null;
}
export function divisionProgress(xp:number){
 const current=divisionForXp(xp),next=nextDivisionForXp(xp);
 if(!next)return 1;
 return Math.max(0,Math.min(1,(xp-current.minXp)/Math.max(1,next.minXp-current.minXp)));
}
export function badgeCollectionTier(earned:number,total:number){
 const pct=total?earned/total:0;
 if(pct>=1)return'Complete Collection';
 if(pct>=.75)return'Master Collector';
 if(pct>=.5)return'Badge Hunter';
 if(pct>=.25)return'Collector';
 return'Rookie Collector';
}
export const ENGAGEMENT_SPONSOR_SURFACES=['game_center','progress','community'] as const;
export type EngagementSponsorSurface=typeof ENGAGEMENT_SPONSOR_SURFACES[number];
