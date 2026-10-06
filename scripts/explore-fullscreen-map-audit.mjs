import fs from 'node:fs';

const source=fs.readFileSync('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','utf8');
const signals=fs.readFileSync('apps/consumer-mobile/components/RestroomSignals.tsx','utf8');

function requireToken(token,message){
  if(!source.includes(token))throw new Error(message);
}
function forbidToken(token,message){
  if(source.includes(token))throw new Error(message);
}

requireToken("const [resultsSheetExpanded,setResultsSheetExpanded]=useState(false);",'Explore must expose an expandable results sheet state.');
requireToken("style={s.exploreStage}",'Explore must render the map as the full-screen stage.');
requireToken("style={[s.floatingSearchPanel",'Search and discovery controls must float over the map canvas.');
requireToken("const mapChromeTop=142+(floatingContextRows*38);",'Map controls must start directly below the compact floating control stack.');
requireToken("? Math.min(Math.max(280,Math.round(exploreMapHeight*0.46)),430)",'Expanded results must preserve substantial visible map area.');
requireToken(": (selected||destinationCardOpen?184:132)",'Collapsed results must remain a compact map overlay.');
requireToken("minHeight: 36",'Nearby / Along route controls must stay compact.');
requireToken("filterLauncher:{minHeight:38",'Amenity filters must stay compact in the map-first control stack.');
forbidToken("style={s.valuePromise}",'Explore must not spend map space on explanatory hero copy inside the floating controls.');
if(!signals.includes("style={styles.compactRow}")||!signals.includes("signals.slice(0,4)"))throw new Error('Explore overlay result evidence must stay summary-first and compact.');
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
