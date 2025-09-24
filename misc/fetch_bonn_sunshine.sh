#!/usr/bin/env bash
# fetch_bonn_sunshine.sh
# Holt 14-Tage-Sonnenscheindauer für Bonn und speichert als CSV

set -euo pipefail

command -v jq >/dev/null || { echo "jq nicht gefunden. Bitte installieren."; exit 1; }
command -v curl >/dev/null || { echo "curl nicht gefunden. Bitte installieren."; exit 1; }

LAT=50.7374
LON=7.0982
DAYS=14
TZ="Europe/Berlin"
CSV_FILE="bonn_sunshine_14d.csv"

URL="https://api.open-meteo.com/v1/forecast?latitude=$LAT&longitude=$LON&daily=sunshine_duration,shortwave_radiation_sum&timezone=$TZ&forecast_days=$DAYS"

# HTTP abrufen inkl. Statuscode
TMP_JSON="$(mktemp)"
HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$TMP_JSON" "$URL") || { echo "Abruf fehlgeschlagen."; rm -f "$TMP_JSON"; exit 1; }
if [ "$HTTP_CODE" != "200" ]; then
  echo "Fehler: HTTP $HTTP_CODE"
  cat "$TMP_JSON" 2>/dev/null || true
  rm -f "$TMP_JSON"
  exit 1
fi

# Prüfen, ob daily vorhanden ist
if ! jq -e '.daily and .daily.time' "$TMP_JSON" >/dev/null; then
  echo "Unerwartetes Antwortformat (kein .daily/.daily.time)."
  rm -f "$TMP_JSON"
  exit 1
fi

# CSV schreiben
echo "date,sunshine_hours,shortwave_radiation_sum_Wh_m2" > "$CSV_FILE"
jq -r '
  .daily as $d
  | range(0; ($d.time | length)) as $i
  | [
      $d.time[$i],
      ( ($d.sunshine_duration[$i] // null) as $s
        | if $s == null then null else ($s/3600|round*0.01|./0.01) end
      ),
      ($d.shortwave_radiation_sum[$i] // null)
    ]
  | @csv
' "$TMP_JSON" >> "$CSV_FILE"

rm -f "$TMP_JSON"
echo "OK: Gespeichert nach $CSV_FILE"
