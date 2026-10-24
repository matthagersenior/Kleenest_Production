package com.kleenest.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
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
    val stored = context.getSharedPreferences("kleenest_consumer_widget", 0)
      .getString("snapshot", "{}") ?: "{}"
    val snapshot = try { JSONObject(stored) } catch (_: Exception) { JSONObject() }
    val at = snapshot.optLong("at", 0L)
    val age = System.currentTimeMillis() - at
    val fresh = at > 0L && age >= 0L && age <= MAX_FRESH_MS
    val places = if (fresh) snapshot.optJSONArray("places") else null
    val count = places?.length() ?: 0
    val updated = if (fresh) when (kind) {
      "small" -> if (count == 1) "1 nearby" else "$count nearby"
      "medium" -> "Updated ${age / 60_000L}m ago"
      else -> "Updated ${age / 60_000L} min ago"
    } else when (kind) {
      "small" -> "Open app"
      "medium" -> "Open to refresh"
      else -> "Open app to refresh nearby"
    }
    views.setTextViewText(R.id.kleenest_widget_status, updated)
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
        views.setTextViewText(viewId, if (name.isEmpty()) "Tap to search nearby" else
          if (distance.isEmpty()) name else "$name · $distance")
        val target = if (name.isEmpty() || placeId.isEmpty()) "explore?source=consumer_widget"
          else "location/${Uri.encode(placeId)}?source=consumer_widget"
        views.setOnClickPendingIntent(viewId, open(context,id,3+position,target))
      }
    }
    if (kind == "large") {
      views.setOnClickPendingIntent(R.id.kleenest_widget_qr, open(context,id,7,"qr?source=consumer_widget"))
    }
    manager.updateAppWidget(id, views)
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
