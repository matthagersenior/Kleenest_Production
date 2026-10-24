import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const config=read('apps/consumer-mobile/app.config.ts');
const packageJson=JSON.parse(read('apps/consumer-mobile/package.json'));
const lock=JSON.parse(read('package-lock.json'));
const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
const android=read('apps/consumer-mobile/plugins/withKleenestAndroidWidget.js');
const provider=read('apps/consumer-mobile/plugins/android-widget/KleenestWidgetProvider.kt');
const bridge=read('apps/consumer-mobile/plugins/android-widget/KleenestWidgetBridge.kt');
const ios=read('apps/consumer-mobile/widgets/KleenestNearby.tsx');
const iosPublisher=read('apps/consumer-mobile/services/consumerWidgets.ios.ts');
const androidPublisher=read('apps/consumer-mobile/services/consumerWidgets.android.ts');

assert.match(config,/withKleenestAndroidWidget/);
assert.match(config,/'expo-widgets'/);
for(const family of ['systemSmall','systemMedium','systemLarge'])assert.ok(config.includes(family));
for(const family of ['small','medium','large']) {
  assert.ok(android.includes('Kleenest'+family[0].toUpperCase()+family.slice(1)+'Widget'));
  assert.ok(provider.includes('Kleenest'+family[0].toUpperCase()+family.slice(1)+'Widget'));
  const xml=read('apps/consumer-mobile/plugins/android-widget/kleenest_widget_'+family+'_info.xml');
  assert.match(xml,/android\.appwidget|appwidget-provider|home_screen/);
  const layout=read('apps/consumer-mobile/plugins/android-widget/kleenest_widget_'+family+'.xml');
  assert.match(layout,/kleenest_widget_status/);
  assert.match(layout,/kleenest_widget_find/);
}
for(const entry of ['KleenestWidgetBridge','KleenestWidgetPackage','publishSnapshot','createNativeModules'])assert.ok(bridge.includes(entry));
assert.match(android,/withAndroidManifest/);
assert.match(android,/withDangerousMod/);
assert.match(android,/android:exported': 'false'/);
assert.match(provider,/MAX_FRESH_MS = 60L \* 60L \* 1000L/);
for(const destination of ['explore','route','qr','location/'])assert.ok(provider.includes(destination));
assert.match(explore,/publishConsumerWidgetSnapshot\(displayRows\.filter\(hasRestroomSignal\)\)/);
assert.match(explore,/publishConsumerWidgetSnapshot\(enriched\.filter\(hasRestroomSignal\)\)/);
assert.match(androidPublisher,/publishSnapshot\(JSON\.stringify/);
assert.doesNotMatch(androidPublisher + iosPublisher, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
assert.match(ios,/['"]widget['"];/);
for(const method of ['createWidget','Link','systemSmall','systemLarge'])assert.ok(ios.includes(method));
assert.match(iosPublisher,/updateTimeline/);
assert.match(iosPublisher,/60\*60\*1000/);
assert.match(iosPublisher,/Open Kleenest to refresh/);
for(const dependency of ['@expo/ui','expo-widgets']){
  assert.ok(packageJson.dependencies[dependency],dependency+' must be a direct consumer dependency');
  assert.ok(lock.packages['node_modules/'+dependency],dependency+' must have a reproducible lock entry');
  assert.equal(lock.packages['apps/consumer-mobile'].dependencies[dependency],packageJson.dependencies[dependency]);
}

assert.match(provider,/views\.apply\(context, null\)/);
assert.match(provider,/R\.layout\.kleenest_widget_fallback/);
assert.match(android,/kleenest_widget_fallback\.xml/);

// Launcher-hosted RemoteViews inflation accepts a strict Android view allowlist.
// Space compiles as an app resource but cannot be inflated by the launcher.
const allowedWidgetViewTags=new Set([
  'LinearLayout','FrameLayout','RelativeLayout','GridLayout','TextView','Button',
  'ImageView','ImageButton','ProgressBar','Chronometer','TextClock',
]);
const fallbackLayout=read('apps/consumer-mobile/plugins/android-widget/kleenest_widget_fallback.xml');
assert.match(fallbackLayout,/<LinearLayout\b/);
assert.match(fallbackLayout,/kleenest_widget_find/);
assert.doesNotMatch(fallbackLayout,/<Space\b/);
const expectedCompactCells={small:[1,1],medium:[2,1],large:[3,2]};
for(const [size,cells] of Object.entries(expectedCompactCells)){
  const resource='apps/consumer-mobile/plugins/android-widget/kleenest_widget_'+size;
  const layout=read(resource+'.xml');
  const tags=[...layout.matchAll(/<([A-Za-z][\w.]*)\b/g)].map(match=>match[1]);
  assert.ok(tags.length>0,size+' widget must have a root view');
  for(const tag of tags) assert.ok(allowedWidgetViewTags.has(tag),
    size+' widget contains unsupported RemoteViews class '+tag);
  const info=read(resource+'_info.xml');
  assert.match(info,new RegExp('android:targetCellWidth="'+cells[0]+'"'),
    size+' widget must use the compact launcher width');
  assert.match(info,new RegExp('android:targetCellHeight="'+cells[1]+'"'),
    size+' widget must use the compact launcher height');
  assert.match(info,new RegExp('android:previewLayout="@layout/kleenest_widget_'+size+'"'),
    size+' widget picker must preview the same valid layout');
  const controls=size==='small'?['status','find']:size==='medium'?
    ['status','find','route','place_1']:['status','find','route','qr','place_1','place_2','place_3'];
  for(const name of controls)assert.ok(layout.includes('@+id/kleenest_widget_'+name),
    size+' widget missing interactive or status view '+name);
}

console.log('Kleenest consumer Android/iOS widget source, freshness, access, and dependency contracts passed.');
