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
  const context={nearbyEnrichmentRunRef:{current:0},search:'Pizza Hut',searchAreaOrigin:[-89.701,38.123],searchAreaLabel:'Sparta, Illinois',
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

test('raster fallback sends an origin referrer to the tile provider',()=>{
  const path='apps/consumer-mobile/web/maplibrePreview.tsx';
  const React={createElement:(type,props,...children)=>({type,props,children})};
  const component=compile(declaration(path,'FallbackRaster'),{React,View:'View',Text:'Text',StyleSheet:{absoluteFill:{}},styles:{},TILE_SIZE:256,useMemo:fn=>fn(),fallbackTiles:()=>[{key:'1',url:'https://tile.openstreetmap.org/13/2054/3157.png',left:0,top:0}]},'FallbackRaster');
  const node=component({viewport:{center:[-89.7,38.1],zoom:13,width:400,height:400}});
  const img=node.children.flat(Infinity).find(child=>child?.type==='img');assert.ok(img);assert.notEqual(img.props.referrerPolicy,'no-referrer');
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
