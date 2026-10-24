package com.kleenest.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.RemoteViews
import com.kleenest.app.R
import org.json.JSONObject

/** Widgets never request background location or make independent trust decisions. */
internal object KleenestWidgetRenderer {
  private const val MAX_FRESH_MS = 60L * 60L * 1000L

  private fun open(context: Context, widgetId: Int, slot: Int, destination: String): PendingIntent {
    val uri = Uri.parse("kleenest://$destination")
    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(
      context,
      widgetId * 10 + slot,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val kinds = listOf(
      Pair(KleenestSmallWidget::class.java, "small"),
      Pair(KleenestMediumWidget::class.java, "medium"),
      Pair(KleenestLargeWidget::class.java, "large")
    )
    for ((type, kind) in kinds) {
      val ids = manager.getAppWidgetIds(ComponentName(context, type))
      for (id in ids) update(context, manager, id, kind)
    }
  }

  fun update(context: Context, manager: AppWidgetManager, id: Int, kind: String) {
    val layout = when (kind) {
      "medium" -> R.layout.kleenest_widget_medium
      "large" -> R.layout.kleenest_widget_large
      else -> R.layout.kleenest_widget_small
    }
    val views = RemoteViews(context.packageName, layout)
    val prefs = context.getSharedPreferences("kleenest_consumer_widget", 0)
    // Each widget keeps its own mode. A pinned search cannot be replaced by an
    // unrelated Explore search or mistaken for the phone's current location.
    val mode = prefs.getString("mode_$id", "current") ?: "current"
    val stored = prefs.getString(
      if (mode == "custom") "custom_snapshot_$id" else "snapshot", "{}"
    ) ?: "{}"
    val snapshot = try { JSONObject(stored) } catch (_: Exception) { JSONObject() }
    val savedArea = if (mode == "custom") snapshot.optString("label", "").trim() else ""
    val area = if (mode == "custom") savedArea.ifEmpty { "Chosen area" }.take(45)
      else "Current area"
    val at = snapshot.optLong("at", 0L)
    val age = System.currentTimeMillis() - at
    val fresh = at > 0L && age >= 0L && age <= MAX_FRESH_MS
    val places = if (fresh) snapshot.optJSONArray("places") else null
    val count = places?.length() ?: 0
    val updated = if (fresh) when (kind) {
      "small" -> if (count == 1) "1 nearby · change" else "$count nearby · change"
      else -> "$area · ${age / 60_000L}m old · change"
    } else when (kind) {
      "small" -> "Set area / refresh"
      else -> "$area · tap to refresh / change"
    }
    views.setTextViewText(R.id.kleenest_widget_status, updated)
    // Status text is also a tappable location-setting control on every size.
    val areaParam = if (savedArea.isNotEmpty()) "&area=${Uri.encode(savedArea)}" else ""
    views.setOnClickPendingIntent(
      R.id.kleenest_widget_status,
      open(context, id, 9, "widget-location?widgetId=$id&source=consumer_widget$areaParam")
    )
    views.setOnClickPendingIntent(R.id.kleenest_widget_find, open(context,id,1,"explore?source=consumer_widget"))
    if (kind != "small") {
      views.setOnClickPendingIntent(R.id.kleenest_widget_route, open(context,id,2,"route?source=consumer_widget"))
      val slots = if (kind == "large") listOf(
        R.id.kleenest_widget_place_1, R.id.kleenest_widget_place_2, R.id.kleenest_widget_place_3
      ) else listOf(R.id.kleenest_widget_place_1)
      for ((position, viewId) in slots.withIndex()) {
        val place = if (position < count) places?.optJSONObject(position) else null
        val name = place?.optString("name")?.trim().orEmpty()
        val distance = place?.optString("distance")?.trim().orEmpty()
        val placeId = place?.optString("id")?.trim().orEmpty()
        views.setTextViewText(viewId, if (name.isEmpty())
          if (mode == "custom") "Tap above to choose an area" else "Tap to search nearby" else
          if (distance.isEmpty()) name else "$name · $distance")
        val target = if (name.isEmpty() || placeId.isEmpty()) "explore?source=consumer_widget"
          else "location/${Uri.encode(placeId)}?source=consumer_widget"
        views.setOnClickPendingIntent(viewId, open(context,id,3+position,target))
      }
    }
    if (kind == "large") {
      views.setOnClickPendingIntent(R.id.kleenest_widget_qr, open(context,id,7,"qr?source=consumer_widget"))
    }
    // Validate with Android's own RemoteViews inflater before publishing.
    // If a future layout slips past source audits, retain a working app shortcut.
    try {
      views.apply(context, null)
      manager.updateAppWidget(id, views)
    } catch (error: RuntimeException) {
      Log.e("KleenestWidget", "Unable to inflate $kind widget; showing safe shortcut", error)
      val fallback = RemoteViews(context.packageName, R.layout.kleenest_widget_fallback)
      fallback.setOnClickPendingIntent(
        R.id.kleenest_widget_find, open(context, id, 1, "explore?source=consumer_widget")
      )
      manager.updateAppWidget(id, fallback)
    }
  }
}

class KleenestSmallWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { KleenestWidgetRenderer.update(context, manager, it, "small") }
  }
}

class KleenestMediumWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { KleenestWidgetRenderer.update(context, manager, it, "medium") }
  }
}

class KleenestLargeWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { KleenestWidgetRenderer.update(context, manager, it, "large") }
  }
}
