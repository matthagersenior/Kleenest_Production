#!/usr/bin/env bash
set -euo pipefail

APK="${1:?APK path required}"
PACKAGE="${2:?Android package required}"
LABEL="${3:-Android}"
DEEPLINK="${4:-}"
LOG_DIR="${5:-android-startup-logs}"
STARTUP_WAIT="${STARTUP_WAIT_SECONDS:-30}"
DEEPLINK_WAIT="${DEEPLINK_WAIT_SECONDS:-30}"

mkdir -p "$LOG_DIR"

capture_diagnostics() {
  adb logcat -d -v threadtime > "$LOG_DIR/logcat.txt" 2>&1 || true
  adb logcat -b crash -d -v threadtime > "$LOG_DIR/crash-buffer.txt" 2>&1 || true
  adb shell dumpsys package "$PACKAGE" > "$LOG_DIR/package.txt" 2>&1 || true
  adb shell dumpsys activity exit-info "$PACKAGE" > "$LOG_DIR/exit-info.txt" 2>&1 || true
  adb shell dumpsys activity activities > "$LOG_DIR/activities.txt" 2>&1 || true
  adb shell getprop > "$LOG_DIR/device-properties.txt" 2>&1 || true
}

fail_with_diagnostics() {
  local reason="$1"
  capture_diagnostics
  echo "$LABEL startup smoke failed: $reason" >&2
  echo '--- crash buffer ---' >&2
  tail -n 400 "$LOG_DIR/crash-buffer.txt" >&2 || true
  echo '--- package exit info ---' >&2
  tail -n 400 "$LOG_DIR/exit-info.txt" >&2 || true
  echo '--- app logcat tail ---' >&2
  grep -Ei "$PACKAGE|AndroidRuntime|ReactNativeJS|FATAL EXCEPTION|UnsatisfiedLinkError|SIGABRT|SIGSEGV" "$LOG_DIR/logcat.txt" | tail -n 800 >&2 || true
  exit 1
}

adb wait-for-device
adb install -r "$APK" > "$LOG_DIR/install.txt" 2>&1 || { cat "$LOG_DIR/install.txt" >&2; exit 1; }
adb shell dumpsys package "$PACKAGE" > "$LOG_DIR/package-after-install.txt" 2>&1 || true
if [[ "$PACKAGE" == "com.kleenest.app" ]]; then
  adb shell pm grant "$PACKAGE" android.permission.ACCESS_COARSE_LOCATION || true
  adb shell pm grant "$PACKAGE" android.permission.ACCESS_FINE_LOCATION || true
  adb emu geo fix -89.703 38.123 || true
fi
adb logcat -c
adb shell am force-stop "$PACKAGE"
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 > "$LOG_DIR/launch.txt" 2>&1 || true
sleep "$STARTUP_WAIT"
PID="$(adb shell pidof "$PACKAGE" | tr -d '\r' || true)"
capture_diagnostics
[[ -n "$PID" ]] || fail_with_diagnostics 'process exited during initial launch'
if grep -Eqi "Process: ${PACKAGE//./\\.}|FATAL EXCEPTION.*${PACKAGE//./\\.}|UnsatisfiedLinkError" "$LOG_DIR/logcat.txt"; then
  fail_with_diagnostics 'fatal startup signature found in logcat'
fi

if [[ -n "$DEEPLINK" ]]; then
  adb shell am start -W -a android.intent.action.VIEW -d "$DEEPLINK" "$PACKAGE" > "$LOG_DIR/deeplink.txt" 2>&1 || fail_with_diagnostics 'deep link launch failed'
  sleep "$DEEPLINK_WAIT"
  PID="$(adb shell pidof "$PACKAGE" | tr -d '\r' || true)"
  capture_diagnostics
  [[ -n "$PID" ]] || fail_with_diagnostics 'process exited after deep link launch'
fi

echo "$LABEL APK stayed alive through startup smoke test."
