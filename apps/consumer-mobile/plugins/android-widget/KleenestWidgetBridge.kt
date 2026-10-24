package com.kleenest.app.widgets

import android.appwidget.AppWidgetManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject

class KleenestWidgetBridge(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "KleenestWidgetBridge"

  private val preferences get() = context.getSharedPreferences("kleenest_consumer_widget", 0)

  private fun isOwnWidget(id: Int): Boolean {
    if (id <= 0) return false
    val provider = AppWidgetManager.getInstance(context).getAppWidgetInfo(id)?.provider ?: return false
    return provider.packageName == context.packageName &&
      provider.className.startsWith("com.kleenest.app.widgets.Kleenest") &&
      provider.className.endsWith("Widget")
  }

  private fun isValidSnapshot(data: JSONObject): Boolean {
    val at = data.optLong("at", 0L)
    val results = data.optJSONArray("places")
    if (at <= 0L || at > System.currentTimeMillis() + 60_000L ||
        results == null || results.length() > 3) return false
    for (i in 0 until results.length()) {
      val place = results.optJSONObject(i)
      if (place == null || place.optString("name").length > 120 ||
          place.optString("id").length > 80) return false
    }
    return true
  }

  // Current-location snapshots only come from foreground Explore, not from
  // arbitrary widget taps or independent background tracking.
  @ReactMethod
  fun publishSnapshot(serialized: String, promise: Promise) {
    try {
      val data = JSONObject(serialized)
      if (!isValidSnapshot(data)) {
        promise.reject("INVALID_WIDGET_SNAPSHOT", "Snapshot requires a valid timestamp and at most 3 places")
        return
      }
      preferences.edit().putString("snapshot", serialized.take(2500)).apply()
      KleenestWidgetRenderer.updateAll(context)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("WIDGET_SNAPSHOT_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun configureWidget(widgetId: Int, mode: String, promise: Promise) {
    if (!isOwnWidget(widgetId) || mode != "current") {
      promise.reject("INVALID_WIDGET_MODE", "Choose an installed widget and a supported location mode")
      return
    }
    try {
      preferences.edit().putString("mode_$widgetId", mode).apply()
      KleenestWidgetRenderer.updateAll(context)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("WIDGET_MODE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun publishCustomSnapshot(serialized: String, widgetId: Int, promise: Promise) {
    try {
      if (!isOwnWidget(widgetId)) {
        promise.reject("INVALID_WIDGET_ID", "The requested home-screen widget was not found")
        return
      }
      val data = JSONObject(serialized)
      val label = data.optString("label").trim()
      if (label.isBlank() || label.length > 80 || !isValidSnapshot(data)) {
        promise.reject("INVALID_WIDGET_AREA", "Choose a valid named search area")
        return
      }
      // Store the choice and its matching search results atomically. Unrelated
      // Explore searches may update 'snapshot' but cannot replace this area.
      preferences.edit()
        .putString("custom_snapshot_$widgetId", serialized.take(2500))
        .putString("mode_$widgetId", "custom")
        .apply()
      KleenestWidgetRenderer.updateAll(context)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("WIDGET_AREA_FAILED", error.message, error)
    }
  }
}

class KleenestWidgetPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(KleenestWidgetBridge(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
