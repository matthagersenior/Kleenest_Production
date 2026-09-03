import fs from 'node:fs';
const files=['apps/consumer-mobile/services/routeTrust.ts','apps/consumer-mobile/services/trustMissions.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/saved.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/components/LocationAmenityInventory.tsx','apps/consumer-mobile/app/location/[id].tsx','apps/consumer-mobile/app/play.tsx'];
const failures=[];for(const file of files)if(!fs.existsSync(file))failures.push(`missing trust decision file: ${file}`);
if(!failures.length){const read=file=>fs.readFileSync(file,'utf8'),trust=read(files[0]),missionStore=read(files[1]),explore=read(files[2]),saved=read(files[3]),route=read(files[4]),location=read(files[5]),locationPage=read(files[6]),play=read(files[7]);
 for(const label of ['Strong evidence','Recent evidence','Limited evidence','Needs verification'])if(!trust.includes(label))failures.push(`Shared trust confidence model missing label: ${label}`);
 if(!trust.includes('trustEvidenceLine')||!trust.includes('routeTrustScore')||!trust.includes('bestEvidencedStop'))failures.push('Trust guidance must centralize scoring, evidence summaries, and strongest-evidence selection.');
 if(!trust.includes('trustContributionPriority')||!trust.includes('trustContributionMission')||!trust.includes('firstContributionOpportunity'))failures.push('Trust guidance must centralize contribution priority, mission copy, and opportunity selection.');
 for(const priority of ["return'high'","return'medium'","return'low'","return'none'"])if(!trust.includes(priority))failures.push(`Contribution model missing priority state: ${priority}`);
 if(!trust.includes('another verified visit')||!trust.includes('current photos')||!trust.includes('amenity observations'))failures.push('Contribution missions must derive from concrete evidence gaps.');
 for(const token of ['SecureStore','missionFromTrust','startTrustMission','readTrustMission','completeTrustMission','clearTrustMission','completedAt'])if(!missionStore.includes(token))failures.push(`Persistent trust mission store missing lifecycle token: ${token}`);
 if(!missionStore.includes('Check in while physically at this restroom')||!missionStore.includes('Publish a verified review from that eligible check-in'))failures.push('Persistent trust missions must preserve the verified check-in → review sequence.');

 // Explore is the lightweight bathroom finder. Verify behavior rather than exact formatting.
 const compactExplore=explore.replace(/\s+/g,'');
 for(const token of ['trust?.verified_visit_count','trust?.photo_evidence_count','trust?.amenity_evidence_count','trust?.latest_verified_at','visitFreshness(trust?.latest_verified_at)','BEST NEXT DECISION','Start directions'])if(!explore.includes(token))failures.push(`Explore lightweight trust support missing: ${token}`);
 if(!/listLocationTrustSummaries\(data\.map\(/.test(compactExplore)||!compactExplore.includes('attachLocationTrust(data,summaries)'))failures.push('Explore must enrich nearby results with one batched trust request.');
 if(!explore.includes('listNearbyRestrooms')||!explore.includes('distanceLabel(item.distance_meters)')||!explore.includes('distanceLabel(selected.distance_meters)'))failures.push('Explore must explicitly preserve nearby/distance relevance as the primary decision contract.');
 for(const forbidden of ['NEARBY TRUST MISSION','beginMission','startTrustMission(missionFromTrust','setSortMode(\'evidence\')','markerMission','markerBest'])if(explore.includes(forbidden))failures.push(`Explore must keep advanced trust workflow out of the bathroom-finding path: ${forbidden}`);
 if(!explore.includes('markerActive')||!compactExplore.includes('active=id===idOf(selected)'))failures.push('Explore must still distinguish the user-selected bathroom marker from unselected nearby results.');
 if(!compactExplore.includes('constnextSelected="";'))failures.push('Explore cached results must not automatically reopen BEST NEXT DECISION without a new user selection.');
 if(!explore.includes('accessibilityLabel="Close selected location"')||!/onPress=\{\(\)=>setSelectedId\(""\)\}/.test(compactExplore))failures.push('Explore selected-location card must provide an explicit close action.');

 if(!saved.includes('trustConfidenceLabel')||!saved.includes('trustEvidenceLine')||!saved.includes('saved order is unchanged'))failures.push('Saved must use shared trust confidence without silently reordering the shortlist.');
 if(!saved.includes('firstContributionOpportunity(rows)')||!saved.includes('TRUST MISSION')||!saved.includes('startTrustMission(missionFromTrust'))failures.push('Saved must own the persistent trust-mission start lifecycle outside Explore.');
 if(!saved.includes("priority==='high'")||!saved.includes('NEEDS VERIFYING'))failures.push('Saved must visibly distinguish the highest-priority evidence gap.');
 if(!saved.includes("sortMode==='default'")||!saved.includes("sortMode==='evidence'")||!saved.includes("setSortMode('default')")||!saved.includes("setSortMode('evidence')"))failures.push('Saved must expose advanced evidence sorting only as an explicit user-controlled choice.');

 if(!route.includes('trustConfidenceLabel')||!route.includes('trustEvidenceLine')||!route.includes('keeps your stop order exactly as you arranged it'))failures.push('Route must use shared trust confidence while preserving manual stop order.');
 if(!route.includes('function move(index:number,delta:number)'))failures.push('Manual route ordering controls must remain authoritative.');
 if(!route.includes('Move best first')||!route.includes('function moveBestFirst()')||!route.includes('setStopIds(current=>[bestStopId,...current.filter(id=>id!==bestStopId)])'))failures.push('Route may offer a trust shortcut only through an explicit user-controlled reorder action.');
 if(!location.includes('trustConfidenceLabel')||!location.includes('trustEvidenceLine')||!location.includes('trustContributionMission'))failures.push('Location trust snapshot must use shared confidence, evidence, and mission language.');
 if(!location.includes('HIGH-PRIORITY TRUST MISSION')||!location.includes('1. Check in while you are physically here.'))failures.push('Location must translate weak evidence into a concrete verified-contribution sequence.');
 if(!locationPage.includes("missionMode=String(contribute||mission||'')==='1'")||!locationPage.includes('TRUST MISSION ACTIVE')||!locationPage.includes('completeTrustMission(locationId)'))failures.push('Location mission mode must resume either entry parameter and complete only through the persisted mission authority.');
 if(!locationPage.includes('await refresh();setAmenityRefresh(value=>value+1)'))failures.push('Every successful verified review must refresh the location trust snapshot, not only amenity evidence submissions.');
 if(!locationPage.includes('Trust mission completed and this restroom’s evidence has been refreshed.')||!locationPage.includes("missionCompleted=/Trust mission completed/.test(message)"))failures.push('Verified review completion must visibly close the mission and refresh trust evidence.');
 if(!play.includes('readTrustMission()')||!play.includes('ACTIVE TRUST MISSION')||!play.includes('Resume mission')||!play.includes('clearTrustMission()'))failures.push('Play must surface, resume, and clear the persisted trust mission.');
 if(!play.includes("pathname:'/location/[id]'" )||!play.includes("mission:'1'"))failures.push('Play must resume the persisted mission through Location mission mode.');
 if(/sort\([^)]*routeTrustScore|sort\([^)]*trust/i.test(explore+saved+route))failures.push('Screens must not silently sort Explore, Saved, or Route by trust score; explicit sorting belongs in the shared control service.');
}
if(failures.length){console.error('Native trust decision presentation audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}console.log('Native trust decision presentation audit passed.');
