#!/usr/bin/env bash
# Usage: ./csv2xlsx_pv.sh INPUT.csv OUTPUT.xlsx
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 INPUT.csv OUTPUT.xlsx" >&2
  exit 1
fi

inp="$1"
outp="$2"

# Hinweis: benötigt python3 + pandas + XlsxWriter
# Install (falls nötig): python3 -m pip install --user pandas XlsxWriter

python3 - <<'PY' "$inp" "$outp"
import sys, pandas as pd

inp, outp = sys.argv[1], sys.argv[2]
df = pd.read_csv(inp)

# Spalten sauber casten, fehlende Spalten ignorieren
num_cols = ["sunshine_hours","shortwave_radiation_sum_Wh_m2","PV_Ertrag_kWh","Mining_KWh_left"]
for c in num_cols:
    if c in df.columns:
        df[c] = pd.to_numeric(df[c], errors="coerce")

with pd.ExcelWriter(outp, engine="xlsxwriter") as writer:
    df.to_excel(writer, sheet_name="PV", index=False)
    wb = writer.book
    ws = writer.sheets["PV"]

    fmt_header = wb.add_format({"bold": True, "bg_color": "#EEEEEE", "bottom":1})
    fmt_int    = wb.add_format({"num_format": "#,##0"})
    fmt_2dec   = wb.add_format({"num_format": "#,##0.00"})
    fmt_wh     = wb.add_format({"num_format": "#,##0.00"})
    fmt_date   = wb.add_format({"num_format": "yyyy-mm-dd"})

    ws.set_row(0, None, fmt_header)
    ws.autofilter(0, 0, len(df), len(df.columns)-1)

    col_idx = {col:i for i,col in enumerate(df.columns)}
    # Spaltenbreiten + Formate
    def setcol(name, width, fmt):
        if name in col_idx:
            i = col_idx[name]
            ws.set_column(i, i, width, fmt)

    setcol("date", 12, fmt_date)
    setcol("sunshine_hours", 8, fmt_int)
    setcol("shortwave_radiation_sum_Wh_m2", 16, fmt_wh)
    setcol("PV_Ertrag_kWh", 12, fmt_2dec)
    # Wunsch: keine Nachkommastellen bei verfügbarem kW/kWh-Wert
    setcol("Mining_KWh_left", 12, fmt_int)

    # Moderate Auto-Breite für übrige Spalten
    for i, col in enumerate(df.columns):
        width = max(10, min(40, int(max([len(str(col))] + [len(str(v)) for v in df[col].head(200)]) * 1.1)))
        ws.set_column(i, i, width)

    # Freeze header
    ws.freeze_panes(1, 0)

    # Summen unten (sichtbar gefiltert)
    last_row = len(df) + 1
    for c in ["PV_Ertrag_kWh","Mining_KWh_left"]:
        if c in col_idx:
            col_letter = chr(ord('A') + col_idx[c])
            ws.write_formula(last_row, col_idx[c],
                             f"=SUBTOTAL(9,{col_letter}2:{col_letter}{last_row})",
                             fmt_2dec if c=="PV_Ertrag_kWh" else fmt_int)
    ws.write(last_row, 0, "Σ (sichtbar)")
PY

echo "OK: geschrieben -> $outp"
