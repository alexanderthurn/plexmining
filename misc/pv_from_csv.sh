#!/usr/bin/env bash
# Aufruf: ./pv_from_csv.sh input.csv output.csv KWP kwUsed

infile=$1
outfile=$2
kwp=$3
kwUsed=$4

# Header schreiben
echo "date,sunshine_hours,shortwave_radiation_sum_Wh_m2,PV_Ertrag_kWh,Mining_KWh_left" > "$outfile"

gesamt_pv=0
gesamt_mining=0

tail -n +2 "$infile" | while IFS=, read -r date sun radiation; do
  # Wh/m² -> kWh/m²
  kWh_per_m2=$(echo "$radiation / 1000" | bc -l)

  # PV-Ertrag berechnen
  pv=$(echo "$kWh_per_m2 * $kwp" | bc -l)

  # Mining-Übrig
  mining=$(echo "$pv - $kwUsed" | bc -l)

  # Summen
  gesamt_pv=$(echo "$gesamt_pv + $pv" | bc -l)
  gesamt_mining=$(echo "$gesamt_mining + $mining" | bc -l)

  # Zeile in Datei schreiben
  printf "%s,%s,%s,%.2f,%.2f\n" "$date" "$sun" "$radiation" "$pv" "$mining" >> "$outfile"
done

echo "Gesamt PV-Ertrag: $gesamt_pv kWh"
echo "Gesamt Mining-Übrig: $gesamt_mining kWh"
echo "OK: geschrieben -> $outfile"

