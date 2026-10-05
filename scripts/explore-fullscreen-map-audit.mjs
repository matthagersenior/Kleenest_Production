import fs from 'node:fs';

const source=fs.readFileSync('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','utf8');

function requireToken(token,message){
  if(!source.includes(token))throw new Error(message);
}
function forbidToken(token,message){
  if(source.includes(token))throw new Error(message);
}

requireToken("const [resultsSheetExpanded,setResultsSheetExpanded]=useState(false);",'Explore must expose an expandable results sheet state.');
requireToken("style={s.exploreStage}",'Explore must render the map as the full-screen stage.');
requireToken("style={[s.floatingSearchPanel",'Search and discovery controls must float over the map canvas.');
requireToken("style={[s.resultsSheet",'Nearby/route results must live in a map-overlay results sheet.');
requireToken("accessibilityLabel={resultsSheetExpanded?'Collapse results':'Expand results'}",'The results sheet must expose an accessible expand/collapse control.');
requireToken("style={s.resultsSheetList}",'Expanded results must scroll inside the overlay sheet.');
requireToken("style={s.selectedSheetActions}",'Selected-place primary actions must stay outside the scrolling detail body.');
requireToken("if(rawQuery&&retainedMapOrigin&&!areaMatch&&!overrideOrigin)setDestinationCardOpen(false);",'A brand/category search from a chosen address must reveal results instead of leaving the destination card open.');
requireToken("renderItem={() => null}",'Legacy below-map result cards must stay disabled after the unified results-sheet revamp.');
requireToken("<MapLegend />",'The map legend must remain available on the unified Explore canvas.');
requireToken(">Nearby</Text>",'Nearby discovery mode must remain available.');
requireToken(">Along route</Text>",'Along-route discovery mode must remain available.');
forbidToken("style={[s.mapFrame,{height:exploreMapHeight}]}",'Explore must not return to a fixed-height map viewport.');
forbidToken("style={[s.selectedPanel", 'Selected-place details must not return to the old fixed overlay card.');

console.log('Explore full-screen map layout contract is present.');
