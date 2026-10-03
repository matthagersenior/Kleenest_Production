import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const screenPath='apps/consumer-mobile/features/AdaptiveExploreScreen.tsx';
function declaration(path,name){
  const source=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let found;
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit);}
  visit(source);assert.ok(found,`Production function ${name} exists`);
  return found.getText(source).replace(/^export /,'');
}
function variableDeclaration(path,name){
  const source=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let found;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name?.getText(source)===name)found=node;ts.forEachChild(node,visit);}
  visit(source);assert.ok(found,`Production variable ${name} exists`);
  return `const ${name}=${found.initializer?.getText(source)};`;
}
function compile(source,context,name){
  const js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(context),`${js};return ${name};`)(...Object.values(context));
}
function labels(node){if(!node||typeof node!=='object')return [];return [node.props?.accessibilityLabel,...(node.children||[]).flat(Infinity).flatMap(labels)].filter(Boolean);}
function optionalHelpers(path){if(!fs.existsSync(path))return {};const output={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(js,{exports:output});return output;}

test('brand search retains the chosen Sparta origin without requesting GPS',async()=>{
  let gpsCalls=0;let cleared=false;
  let source=declaration(screenPath,'loadNearby');
  source=source.slice(0,source.indexOf('    let result:'))+'return {nextOrigin,query};}';
  const noop=()=>{};
  const context={nearbyEnrichmentRunRef:{current:0},activeIntentRef:{current:null},activeIntentAmenitiesRef:{current:null},selectedAmenityNames:[],radius:1609,maxRadius:402336,autoExpand:true,search:'Pizza Hut',searchAreaOrigin:[-89.701,38.123],searchAreaLabel:'Sparta, Illinois',
    looksLikeAddressOrArea:()=>false,currentLocation:async()=>{gpsCalls++;return {coords:{longitude:-90,latitude:39}};},
    recordConsumerPresenceAt:async()=>null,refreshConsumerPresence:async()=>null,
    setSearch:noop,setSearchAreaOrigin:value=>{if(value===null)cleared=true;},setSearchAreaLabel:noop,setPendingMapOrigin:noop,setDestinationCardOpen:noop,setRoute:noop,snapMapToDiscoveryOrigin:noop};
  const result=await compile(source,context,'loadNearby')();
  assert.equal(gpsCalls,0);assert.deepEqual(result.nextOrigin,[-89.701,38.123]);assert.equal(result.query,'Pizza Hut');assert.equal(cleared,false);
});

for(const value of [null,undefined,'',0,75])test(`cleanliness ${JSON.stringify(value)} preserves unknown versus observed zero`,()=>{
  const path='apps/consumer-mobile/components/RestroomSignals.tsx';
  const React={createElement:(type,props,...children)=>({type,props,children})};
  const context={React,View:'View',Text:'Text',useConsumerTheme:()=>({}),styles:{},knownRestroomFacilitySignals:()=>[],isKleenestNetworkVerified:()=>false,isBusinessClaimed:()=>false,networkState:()=>'',needsRestroomVerification:()=>false,hasRestroomEvidence:()=>false,isVerifiedRestroom:()=>false,...optionalHelpers('apps/consumer-mobile/services/discoveryPresentation.ts')};
  const component=compile(declaration(path,'CompactRestroomSignals'),context,'CompactRestroomSignals');
  const actual=labels(component({item:{cleanliness_pct:value}}));
  if(value==null||value==='')assert.ok(!actual.some(label=>/0 percent clean/.test(label)),actual.join(', '));
  else assert.ok(actual.includes(`${value} percent clean`));
});

test('town search recovers when the primary geocoder is unavailable',async()=>{
  let handler;
  const source=fs.readFileSync('supabase/functions/resolve-consumer-location/index.ts','utf8').replace(/^import .*;\s*/,'');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{Deno:{env:{get:()=>undefined},serve:fn=>{handler=fn;}},URL,Request,Response,TextEncoder,AbortSignal,setTimeout,console,
    fetch:async url=>String(url).includes('tigerweb.geo.census.gov')?Response.json({features:[{attributes:{BASENAME:'Sparta',STATE:'17',CENTLAT:'38.1275',CENTLON:'-89.7061',INTPTLAT:'38.1275',INTPTLON:'-89.7061'}}]}):new Response('Unavailable',{status:503})});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Sparta, Illinois'})}));
  const data=await response.json();assert.equal(response.status,200);assert.equal(data.resolved.latitude,38.1275);assert.equal(data.resolved.longitude,-89.7061);assert.match(data.resolved.label,/Sparta/);
});


test('different unnamed listings remain distinct without losing records',()=>{
  const helpers=optionalHelpers('apps/consumer-mobile/services/discoveryPresentation.ts');
  assert.equal(typeof helpers.discoveryPlaceName,'function','Unnamed records need consumer display identities');
  const a={id:'a',name:'Unnamed service',latitude:38.65,longitude:-90.26,address:'4500 Maryland Ave'};
  const b={id:'b',name:'Unnamed service',latitude:38.651,longitude:-90.26,address:'4502 Maryland Ave'};
  assert.notEqual(helpers.discoveryPlaceName(a),helpers.discoveryPlaceName(b));
  assert.match(helpers.discoveryPlaceName(a),/4500/);
  assert.equal(helpers.discoveryPlaceName({name:'Pizza Hut'}),'Pizza Hut');
});

test('co-located places remain selectable at maximum map zoom',()=>{
  const helpers=optionalHelpers('apps/consumer-mobile/services/discoveryPresentation.ts');
  const context={hasCoordinates:row=>row.latitude!=null&&row.longitude!=null, idOf:row=>row.id,...helpers};
  const source=declaration(screenPath,'markerClusterCellDegrees')+'\n'+declaration(screenPath,'organizeMapMarkers');
  const groups=compile(source,context,'organizeMapMarkers')([{id:'a',latitude:38.65,longitude:-90.26},{id:'b',latitude:38.65,longitude:-90.26}],18);
  assert.equal(groups.length,1);assert.equal(groups[0].rows.length,2);
});

test('sports-center category is distinct from park',()=>{
  const helpers=optionalHelpers('apps/consumer-mobile/services/discoveryPresentation.ts');
  assert.equal(helpers.discoveryPlaceCategory({category:'park',osm_tags:{leisure:'sports_centre'}}),'fitness');
  assert.equal(helpers.discoveryPlaceCategory({category:'park',osm_tags:{leisure:'park'}}),'park');
});

test('raster map dragging updates the discovery center in the drag direction',()=>{
  const path='apps/consumer-mobile/web/maplibrePreview.tsx';
  const source=declaration(path,'clampLatitude')+'\n'+declaration(path,'worldPoint')+'\n'+declaration(path,'panFallbackViewport');
  const pan=compile(source,{TILE_SIZE:256},'panFallbackViewport');
  const viewport={center:[-90.26,38.65],zoom:13,width:400,height:400};
  const next=pan(viewport,-200,0);
  assert.ok(Math.abs(next.center[0]-(viewport.center[0]+200*360/(256*2**13)))<0.00001);assert.ok(Math.abs(next.center[1]-viewport.center[1])<0.00001);
  assert.deepEqual(pan(viewport,0,0).center,viewport.center);
});

test('user map movement keeps the camera center for the next zoom',()=>{
  let cameraCenter,pending;
  const handler=compile(declaration(screenPath,'handleMapRegionDidChange'),{setMapInteracting:()=>{},setMapZoom:()=>{},setMapCenter:center=>{cameraCenter=center;},setFitRouteCamera:()=>{},setPendingMapOrigin:center=>{pending=center;},mode:'nearby',searchAreaOrigin:[-90.26,38.65],origin:null},'handleMapRegionDidChange');
  handler({nativeEvent:{center:[-90.22,38.65],zoom:13,userInteraction:true}});
  assert.deepEqual(cameraCenter,[-90.22,38.65]);assert.deepEqual(pending,cameraCenter);
});

test('fallback dragging ignores a second pointer and commits the active center',()=>{
  const path='apps/consumer-mobile/web/maplibrePreview.tsx';
  const updates=[],regions=[];
  const React={createElement:(type,props,...children)=>({type,props,children})};
  const pan=compile(declaration(path,'clampLatitude')+'\n'+declaration(path,'worldPoint')+'\n'+declaration(path,'panFallbackViewport'),{TILE_SIZE:256},'panFallbackViewport');
  const component=compile(declaration(path,'Map'),{React,View:'View',FallbackMapNotice:'Notice',MapContext:{Provider:'Provider'},styles:{map:{}},DEFAULT_CENTER:[-90.26,38.65],DEFAULT_ZOOM:13,useRef:initial=>({current:initial}),useEffect:()=>{},useState:initial=>[initial===false?true:initial,next=>{if(next?.center)updates.push(next);} ],panFallbackViewport:pan},'Map');
  const node=component({onRegionDidChange:event=>regions.push(event)});
  const drag=node.children.flat(Infinity).find(child=>child?.props?.['aria-label']==='Drag map to explore another area');assert.ok(drag);
  const target={setPointerCapture:()=>{},releasePointerCapture:()=>{},hasPointerCapture:()=>true};
  const event=(pointerId,x)=>({pointerId,button:0,clientX:x,clientY:0,currentTarget:target});
  drag.props.onPointerDown(event(1,0));drag.props.onPointerMove(event(1,100));
  drag.props.onPointerDown(event(2,0));drag.props.onPointerMove(event(2,500));drag.props.onPointerUp(event(2,500));
  assert.equal(updates.length,1);assert.equal(regions.length,0);
  drag.props.onPointerMove(event(1,150));drag.props.onPointerUp(event(1,150));
  assert.equal(updates.length,2);assert.equal(regions.length,1);assert.deepEqual(regions[0].nativeEvent.center,updates[1].center);
  drag.props.onPointerDown(event(3,0));drag.props.onPointerMove(event(3,1));drag.props.onPointerCancel(event(3,1));
  assert.equal(regions.length,2);assert.deepEqual(regions[1].nativeEvent.center,updates[2].center);
});

test('route fitting is explicit and manual camera actions keep their center',()=>{
  const camera=compile(declaration(screenPath,'exploreCameraViewState'),{},'exploreCameraViewState');
  const bounds=[-91,38,-89,39],center=[-90.2,38.7];
  assert.deepEqual(camera(bounds,true,center,13).bounds,bounds);
  assert.deepEqual(camera(bounds,false,center,15),{center,zoom:15});
});


test('programmatic route fitting retains the displayed center without proposing discovery',()=>{
  let center,fitChanges=0,pendingChanges=0;
  const handler=compile(declaration(screenPath,'handleMapRegionDidChange'),{setMapInteracting:()=>{},setMapZoom:()=>{},setMapCenter:value=>{center=value;},setFitRouteCamera:()=>{fitChanges++;},setPendingMapOrigin:()=>{pendingChanges++;},mode:'nearby',searchAreaOrigin:[-89,38],origin:null},'handleMapRegionDidChange');
  handler({nativeEvent:{center:[-90,38.5],zoom:9,userInteraction:false}});
  assert.deepEqual(center,[-90,38.5]);assert.equal(fitChanges,0);assert.equal(pendingChanges,0);
  const camera=compile(declaration(screenPath,'exploreCameraViewState'),{},'exploreCameraViewState');
  assert.deepEqual(camera([-91,38,-89,39],false,center,10),{center:[-90,38.5],zoom:10});
});

test('fallback route fitting reports its actual viewport for subsequent zoom',()=>{
  const path='apps/consumer-mobile/web/maplibrePreview.tsx';let applied,reported;const effects=[];
  const context={map:null,fallback:true,viewport:{center:[-89,38],zoom:13,width:600,height:400},setViewport:value=>{applied=value;},reportRegionChange:(value,userInteraction)=>{reported={value,userInteraction};}};
  const camera=compile(declaration(path,'Camera'),{useContext:()=>context,MapContext:{},useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),zoomForBounds:()=>9},'Camera');
  camera({initialViewState:{bounds:[-91,38,-89,39]}});effects[0]();
  assert.deepEqual(applied.center,[-90,38.5]);assert.equal(applied.zoom,9);assert.deepEqual(reported,{value:applied,userInteraction:false});
});


test('Explore explains Kleenest value before exposing advanced discovery controls',()=>{
  const source=fs.readFileSync(screenPath,'utf8');
  assert.match(source,/Find a place you can count on\./);
  assert.match(source,/Search a place or address, then tap a result to go\./i);
  assert.match(source,/Find a useful stop on the way\./);
  assert.match(source,/Enter where you’re going\. We’ll show useful stops on the way\./i);
  assert.ok(source.indexOf('Find a place you can count on.')<source.indexOf('Filter places'),'Core value must appear before advanced filters');
});

test('Explore core filters use user language instead of implementation language',()=>{
  const source=fs.readFileSync(screenPath,'utf8');
  for(const required of ['Kleenest partners','Earn rewards','Recently confirmed','Needs an update','Rewards first','How recent?','How far off route?']){
    assert.ok(source.includes(required),`Missing plain-language label: ${required}`);
  }
  for(const retired of ['Paying Kleenest business locations','>Progression<','>Verified evidence<','>Evidence gaps<','>Progression first<','>Freshness<','>Route corridor<']){
    assert.ok(!source.includes(retired),`Implementation-shaped copy remains: ${retired}`);
  }
});


test('natural discovery request is not mistaken for a literal address search',()=>{
  const intentHelpers=optionalHelpers('apps/consumer-mobile/services/discoveryIntentCore.js');
  const looksLikeAddressOrArea=compile(variableDeclaration(screenPath,'looksLikeAddressOrArea'),{shouldInterpretDiscoveryQuery:intentHelpers.shouldInterpretDiscoveryQuery},'looksLikeAddressOrArea');
  assert.equal(looksLikeAddressOrArea('123 Main St, Sparta, IL 62286'),true);
  assert.equal(looksLikeAddressOrArea('Pizza Hut'),false);
  assert.equal(looksLikeAddressOrArea('clean restroom with a changing table on my way to St. Louis'),false);
});


test('map-area search overrides a retained typed address',async()=>{
  let gpsCalls=0,geocodeCalls=0;
  let source=declaration(screenPath,'loadNearby');
  source=source.slice(0,source.indexOf('    let result:'))+'return {nextOrigin,query};}';
  const noop=()=>{};
  const dragged=[-90.31,38.66];
  const context={nearbyEnrichmentRunRef:{current:0},activeIntentRef:{current:null},activeIntentAmenitiesRef:{current:null},selectedAmenityNames:[],radius:1609,maxRadius:402336,autoExpand:true,search:'4500 Maryland Ave, St Louis, MO',searchAreaOrigin:[-90.24897,38.65415],searchAreaLabel:'4500 Maryland Ave',
    looksLikeAddressOrArea:()=>true,resolveConsumerSearchLocation:async()=>{geocodeCalls++;return {longitude:-90.24897,latitude:38.65415,label:'4500 Maryland Ave'};},
    currentLocation:async()=>{gpsCalls++;return {coords:{longitude:-90,latitude:39}};},
    recordConsumerPresenceAt:async()=>null,refreshConsumerPresence:async()=>null,
    setSearch:noop,setSearchAreaOrigin:noop,setSearchAreaLabel:noop,setPendingMapOrigin:noop,setDestinationCardOpen:noop,setRoute:noop,snapMapToDiscoveryOrigin:noop};
  const result=await compile(source,context,'loadNearby')(false,false,dragged,false);
  assert.equal(gpsCalls,0);assert.equal(geocodeCalls,0);assert.deepEqual(result.nextOrigin,dragged);assert.equal(result.query,'');
});


test('destination card keeps map-area search reachable after a drag',()=>{
  const source=fs.readFileSync(screenPath,'utf8');
  assert.ok(source.includes("pendingMapOrigin&&mode==='nearby'&&!destinationCardOpen"));
  assert.ok(source.includes("mode==='nearby'&&pendingMapOrigin?<Pressable"));
  assert.ok(source.includes('accessibilityLabel="Search this map area"'));
});


test('manual route start builds without GPS',async()=>{
  const path='apps/consumer-mobile/app/route.tsx';
  let gpsCalls=0,builtOrigin=null;
  const build=compile(declaration(path,'build'),{
    building:false,stopIds:['stop-1'],setBuilding:()=>{},setMessage:()=>{},setRouteBrief:()=>{},
    routeStartOrigin:[-89.70,38.12],routeStartLabel:'Sparta, Illinois',stops:[],bestStop:null,organicRouteSummary:async()=>'',
    Location:{requestForegroundPermissionsAsync:async()=>{gpsCalls++;return{status:'granted'};},getCurrentPositionAsync:async()=>{gpsCalls++;return{coords:{longitude:-90,latitude:39}}},Accuracy:{Balanced:1}},
    buildMobileRoute:async(origin)=>{builtOrigin=origin;return{distanceMiles:10,durationMinutes:20};},setBuilt:()=>{}
  },'build');
  await build();
  assert.equal(gpsCalls,0);assert.deepEqual(builtOrigin,[-89.70,38.12]);
});


test('Explore carries its discovery origin into route planning',()=>{
  const source=fs.readFileSync(screenPath,'utf8');
  assert.ok(source.includes("startLng:String(routeStart[0])"));
  assert.ok(source.includes("startLat:String(routeStart[1])"));
  assert.ok(source.includes("searchAreaOrigin||origin"));
});


test('external directions preserve an Explore return snapshot',()=>{
  const source=fs.readFileSync(screenPath,'utf8');
  assert.ok(source.includes('await preserveExploreReturnState();\n    await Linking.openURL'));
  const cache=fs.readFileSync('apps/consumer-mobile/services/nearbyCache.ts','utf8');
  assert.ok(cache.includes('EXPLORE_RETURN_MAX_AGE_MS=30*60*1000'));
  assert.ok(cache.includes('takeExploreReturnState'));
});


test('unverified businesses are not labeled as verified Kleenest restrooms',()=>{
  const path='apps/consumer-mobile/app/location/[id].tsx';
  const label=compile(declaration(path,'restroomIdentityLabel'),{},'restroomIdentityLabel');
  assert.equal(label({},[]),'PLACE DETAILS · RESTROOM UNVERIFIED');
  assert.equal(label({bathroom_verification_status:'verified'},[]),'KLEENEST RESTROOM');
  assert.equal(label({},[{id:'facility'}]),'KLEENEST RESTROOM');
});


test('Explore sponsored placement requests the compact creative',()=>{
  const source=fs.readFileSync(screenPath,'utf8');
  assert.ok(source.includes('contextClass="maps_between_results" compact'));
  const slot=fs.readFileSync('apps/consumer-mobile/components/SponsoredSlot.tsx','utf8');
  assert.ok(slot.includes('compact?<View style={s.compactCreative}>'));
  assert.ok(slot.includes("imageCompact:{width:104,height:74"));
  assert.ok(slot.includes('numberOfLines={compact?2:undefined}'));
});


test('web fallback avoids direct raster tile requests while keeping map affordances',()=>{
  const path='apps/consumer-mobile/web/maplibrePreview.tsx';
  const React={createElement:(type,props,...children)=>({type,props,children})};
  const component=compile(declaration(path,'FallbackMapNotice'),{React,View:'View',Text:'Text',StyleSheet:{absoluteFill:{}},styles:{fallbackBanner:{},fallbackText:{}}},'FallbackMapNotice');
  const node=component();
  assert.ok(labels(node).some(label=>/Basemap unavailable/i.test(label))||JSON.stringify(node).includes('Basemap unavailable'));
  assert.ok(!declaration(path,'FallbackMapNotice').includes('<img'));
});
