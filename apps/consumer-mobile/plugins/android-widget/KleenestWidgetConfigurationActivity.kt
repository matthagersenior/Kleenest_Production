package com.kleenest.app.widgets

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Android launcher widget setup: a deliberate location choice, not a silent
 * default to the last Explore snapshot. GPS is requested only inside Kleenest.
 */
class KleenestWidgetConfigurationActivity : Activity() {
  private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)
    widgetId = intent?.getIntExtra(
      AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    val density = resources.displayMetrics.density
    val padding = (22 * density).toInt()
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padding, padding, padding, padding)
      setBackgroundColor(Color.rgb(8, 39, 29))
    }
    fun label(text: String, size: Float): TextView = TextView(this).apply {
      this.text = text
      textSize = size
      setTextColor(Color.WHITE)
      setPadding(0, 0, 0, (18 * density).toInt())
    }
    column.addView(label("KLEENEST · Restroom Finder", 23f))
    column.addView(label(
      "Choose where to find restrooms. Tap the area line on the widget to change it later.", 15f
    ))
    val current = Button(this).apply {
      text = "Use my current location"
      isAllCaps = false
      backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(100, 228, 187))
      setTextColor(Color.rgb(7, 48, 40))
      contentDescription = "Use phone location when Kleenest refreshes"
      setOnClickListener { finishSetup("current", "explore?source=consumer_widget") }
    }
    val chosen = Button(this).apply {
      text = "Choose a city or address"
      isAllCaps = false
      backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(100, 228, 187))
      setTextColor(Color.rgb(7, 48, 40))
      contentDescription = "Search and pin an area for this widget"
      setOnClickListener { finishSetup(
        "custom", "widget-location?widgetId=$widgetId&source=consumer_widget"
      ) }
    }
    column.addView(current, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    column.addView(chosen, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    column.addView(label(
      "Kleenest updates from the app. The widget does not track your location in the background.", 13f
    ))
    column.gravity = Gravity.CENTER_VERTICAL
    setContentView(column)
  }

  private fun finishSetup(mode: String, destination: String) {
    getSharedPreferences("kleenest_consumer_widget", MODE_PRIVATE)
      .edit().putString("mode_$widgetId", mode).apply()
    val manager = AppWidgetManager.getInstance(this)
    val providerName = manager.getAppWidgetInfo(widgetId)?.provider?.className.orEmpty()
    val kind = when {
      providerName.endsWith("KleenestLargeWidget") -> "large"
      providerName.endsWith("KleenestMediumWidget") -> "medium"
      else -> "small"
    }
    try {
      KleenestWidgetRenderer.update(this, manager, widgetId, kind)
    } catch (error: RuntimeException) {
      // The launcher should still complete placement if the initial render fails.
      // The provider can retry via its normal onUpdate callback.
      android.util.Log.e("KleenestWidget", "Initial widget render failed", error)
    }

    val result = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
    setResult(RESULT_OK, result)
    // Open the proper in-app picker. The custom area is not marked ready until
    // its search succeeds; canceling the picker leaves a visible setup prompt.
    val action = Intent(Intent.ACTION_VIEW, Uri.parse("kleenest://$destination")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    try {
      startActivity(action)
    } catch (error: android.content.ActivityNotFoundException) {
      android.util.Log.w("KleenestWidget", "Unable to open location picker", error)
    } finally {
      finish()
    }
  }
}
