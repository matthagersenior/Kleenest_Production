import assert from 'node:assert/strict';
import fs from 'node:fs';
const prefix='apps/consumer-mobile/android/app/src/main';
const read=p=>fs.readFileSync(p,'utf8');
const manifest=read(prefix+'/AndroidManifest.xml');
const main=read(prefix+'/java/com/kleenest/app/MainApplication.kt');
assert.match(main,/add\(com\.kleenest\.app\.widgets\.KleenestWidgetPackage\(\)\)/);
for(const name of ['Small','Medium','Large']){
  assert.ok(manifest.includes('com.kleenest.app.widgets.Kleenest'+name+'Widget'));
  assert.ok(manifest.includes('android.appwidget.provider'));
  const id=name.toLowerCase();
  assert.ok(fs.existsSync(prefix+'/res/xml/kleenest_widget_'+id+'_info.xml'));
  assert.ok(fs.existsSync(prefix+'/res/layout/kleenest_widget_'+id+'.xml'));
}
assert.ok(fs.existsSync(prefix+'/res/layout/kleenest_widget_fallback.xml'));
assert.ok(fs.existsSync(prefix+'/java/com/kleenest/app/widgets/KleenestWidgetProvider.kt'));
assert.ok(fs.existsSync(prefix+'/java/com/kleenest/app/widgets/KleenestWidgetBridge.kt'));
assert.ok(manifest.includes('com.kleenest.app.widgets.KleenestWidgetConfigurationActivity'));
assert.ok(fs.existsSync(prefix+'/java/com/kleenest/app/widgets/KleenestWidgetConfigurationActivity.kt'));
for(const size of ['small','medium','large']){
  const xml=read(prefix+'/res/xml/kleenest_widget_'+size+'_info.xml');
  assert.ok(xml.includes('android:configure="com.kleenest.app.widgets.KleenestWidgetConfigurationActivity"'));
}

console.log('Generated Android Manifest, providers, React package and widget resources passed.');
