const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

// Expo 57 does not include Android support in expo-widgets. This config plugin
// creates real launcher AppWidgetProviders without changing the Expo SDK.
const kinds = [
  ['KleenestSmallWidget', 'kleenest_widget_small_info', 'Kleenest Quick Find'],
  ['KleenestMediumWidget', 'kleenest_widget_medium_info', 'Kleenest Nearby'],
  ['KleenestLargeWidget', 'kleenest_widget_large_info', 'Kleenest Explore']
];

module.exports = function withKleenestAndroidWidget(config) {
  config = withAndroidManifest(config, config => {
    const app = config.modResults.manifest.application?.[0];
    if (!app) throw new Error('Kleenest widget requires an Android application manifest');
    app.receiver = app.receiver || [];
    for (const [name, metadata, label] of kinds) {
      const className = 'com.kleenest.app.widgets.' + name;
      const declaration = {
        $: { 'android:name': className, 'android:exported': 'false', 'android:label': label },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
        'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/' + metadata } }]
      };
      const index = app.receiver.findIndex(r => r.$?.['android:name'] === className);
      if (index >= 0) app.receiver[index] = declaration;
      else app.receiver.push(declaration);
    }
    app.activity = app.activity || [];
    const activityName = 'com.kleenest.app.widgets.KleenestWidgetConfigurationActivity';
    const activity = {
      $: {
        'android:name': activityName,
        'android:exported': 'true',
        'android:label': 'Choose Kleenest widget location',
      }
    };
    const activityIndex = app.activity.findIndex(a => a.$?.['android:name'] === activityName);
    if (activityIndex >= 0) app.activity[activityIndex] = activity;
    else app.activity.push(activity);
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const root = config.modRequest.platformProjectRoot;
    const app = path.join(root, 'app', 'src', 'main');
    const source = path.join(config.modRequest.projectRoot, 'plugins', 'android-widget');
    const assets = [
      ['KleenestWidgetProvider.kt', 'java/com/kleenest/app/widgets/KleenestWidgetProvider.kt'],
      ['KleenestWidgetBridge.kt', 'java/com/kleenest/app/widgets/KleenestWidgetBridge.kt'],
      ['KleenestWidgetConfigurationActivity.kt', 'java/com/kleenest/app/widgets/KleenestWidgetConfigurationActivity.kt'],
      ['kleenest_widget_background.xml', 'res/drawable/kleenest_widget_background.xml'],
      ['kleenest_widget_fallback.xml', 'res/layout/kleenest_widget_fallback.xml'],
      ...['small', 'medium', 'large'].map(size => ['kleenest_widget_'+size+'.xml','res/layout/kleenest_widget_'+size+'.xml']),
      ...['small','medium','large'].map(size => ['kleenest_widget_'+size+'_info.xml','res/xml/kleenest_widget_'+size+'_info.xml'])
    ];
    for (const [from, dest] of assets) {
      const out = path.join(app, dest);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.copyFile(path.join(source, from), out);
    }
    // Expo SDK 57's older NDK default is not available on current Ubuntu 26
    // build images. Pin the installed 27.3 toolchain for reproducible native builds.
    const gradleProperties = path.join(root, 'gradle.properties');
    const ndkProperty = 'android.ndkVersion=27.3.13750724';
    let properties = await fs.readFile(gradleProperties, 'utf8');
    if (/^android\.ndkVersion=/m.test(properties)) {
      properties = properties.replace(/^android\.ndkVersion=.*$/m, ndkProperty);
    } else {
      properties += '\\n' + ndkProperty + '\\n';
    }
    await fs.writeFile(gradleProperties, properties);
    const main = path.join(app, 'java/com/kleenest/app/MainApplication.kt');
    let content = await fs.readFile(main, 'utf8');
    const marker = 'add(com.kleenest.app.widgets.KleenestWidgetPackage())';
    if (!content.includes(marker)) {
      const anchor = 'PackageList(this).packages.apply {';
      if (!content.includes(anchor)) {
        throw new Error('Kleenest widget could not find SDK 57 MainApplication package registration; fail closed');
      }
      content = content.replace(anchor, anchor + '\n          ' + marker);
      await fs.writeFile(main, content);
    }
    return config;
  }]);
};
