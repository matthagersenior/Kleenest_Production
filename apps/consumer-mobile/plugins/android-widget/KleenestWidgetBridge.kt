package com.kleenest.app.widgets

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

  @ReactMethod
  fun publishSnapshot(serialized: String, promise: Promise) {
    try {
      val data = JSONObject(serialized)
      val at = data.optLong("at", 0L)
      val results = data.optJSONArray("places")
      if (at <= 0L || at > System.currentTimeMillis() + 60_000L || results == null || results.length() > 3) {
        promise.reject("INVALID_WIDGET_SNAPSHOT", "Snapshot requires a valid timestamp and at most 3 places")
        return
      }
      for (i in 0 until results.length()) {
        val place = results.optJSONObject(i)
        if (place == null || place.optString("name").length > 120 || place.optString("id").length > 80) {
          promise.reject("INVALID_WIDGET_PLACE", "Invalid canonical place snapshot")
          return
        }
      }
      for (i in 0 until results.length()) {
        val place = results.optJSONObject(i) ?: continue
        val hasLat = place.has("latitude")
        val hasLon = place.has("longitude")
        val latitude = place.optDouble("latitude", Double.NaN)
        val longitude = place.optDouble("longitude", Double.NaN)
        if (hasLat != hasLon || (hasLat && (!latitude.isFinite() || !longitude.isFinite() ||
              latitude < -90.0 || latitude > 90.0 || longitude < -180.0 || longitude > 180.0 ||
              (latitude == 0.0 && longitude == 0.0)))) {
          promise.reject("INVALID_WIDGET_COORDINATES", "Map coordinates must be a valid latitude/longitude pair")
          return
        }
      }
      context.getSharedPreferences("kleenest_consumer_widget", 0).edit()
        .putString("snapshot", serialized.take(2500)).apply()
      KleenestWidgetRenderer.updateAll(context)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("WIDGET_SNAPSHOT_FAILED", error.message, error)
    }
  }
}

class KleenestWidgetPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(KleenestWidgetBridge(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
