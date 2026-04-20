# Sheets Setup

## Sheet ID
YOUR_SHEET_ID_HERE  ← paste your actual ID here after creating the sheet

## How to Create the Sheet

1. Go to sheets.google.com → New blank spreadsheet
2. Rename it: `Elderly Monitor`
3. Create 4 tabs (rename Sheet1, add 3 more):
   - `EVENTS`
   - `RULES`
   - `ALERTS_LOG`
   - `DASHBOARD`

## EVENTS Tab — Row 1 Headers (columns A–E)
```
Timestamp | Source | Event Type | Value | Notes
```
Freeze row 1: View → Freeze → 1 row.

## RULES Tab — Row 1 Headers + Default Data

Row 1 headers:
```
Rule ID | Description | Threshold Hours | Start Hour | End Hour | Enabled
```

Rows 2–5 — default rules:
```
no_movement      | No phone movement          | 3 | 4 | 22 | TRUE
no_phone_usage   | No calls or notifications  | 2 | 4 | 22 | TRUE
no_morning       | No activity by 6am         | 0 | 4 | 6  | TRUE
combined_silence | No signal from all sources | 2 | 4 | 22 | TRUE
```

Note: `Enabled` column must contain the boolean `TRUE` (not text "TRUE").

## ALERTS_LOG Tab — Row 1 Headers
```
Timestamp | Rule ID | Message | Channel | Acknowledged
```

## DASHBOARD Tab
Leave blank for now — formulas added in the final deployment step.

## Getting Your Sheet ID

From the URL:
```
https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
```
Copy the long string between `/d/` and `/edit`.
