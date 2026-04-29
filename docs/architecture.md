# TrackWise LDRC — Architecture

TrackWise LDRC is an elderly wellbeing monitoring system for the Learning & Development Resource Centre (LDRC) that aggregates activity signals from an Android phone, Alexa device, and a CCTV camera into a Google Sheets dashboard, then fires Telegram and WhatsApp alerts when configured silence thresholds are breached.

```mermaid
flowchart TD
    subgraph Sources["Event Sources"]
        PHONE["Android Phone\n(Termux)\nmonitor.sh — runs every 5 min\nAccelerometer / Call Log / Notifications"]
        ALEXA["Alexa Device\n(IFTTT Webhook)\nTimer set events"]
        CCTV["CCTV Camera\n(kensho-local / YOLO)\ncctv_sheet_hook.py"]
    end

    subgraph AppScript["Google Apps Script Web App"]
        INGEST["ingest.gs\ndoPost()\nAppend row to EVENTS sheet"]
        RULES["rules_engine.gs\nrunRulesEngine()\nRuns every 10 min via time trigger"]
        ALERTSEND["alert_sender.gs\nsendAlert()\nLogs to ALERTS_LOG sheet"]
    end

    subgraph Sheets["Google Sheets"]
        EVENTS["EVENTS sheet\ntimestamp / source / eventType / value / notes"]
        RULES_SHEET["RULES sheet\nruleId / thresholdHours / startHour / endHour / enabled"]
        ALERTS_LOG["ALERTS_LOG sheet\ntimestamp / ruleId / message / channel / acknowledged"]
        DASHBOARD["DASHBOARD sheet\nStatus / Last-seen per source / Today's event count"]
    end

    subgraph Notify["Notifications"]
        TELEGRAM["Telegram Bot\nWarning + Alert messages"]
        WHATSAPP["WhatsApp\n(CallMeBot API)\nAlert-level messages only"]
    end

    PHONE -->|"POST JSON"| INGEST
    ALEXA -->|"POST JSON via IFTTT"| INGEST
    CCTV -->|"POST JSON"| INGEST

    INGEST --> EVENTS
    EVENTS --> RULES
    RULES_SHEET --> RULES
    RULES --> ALERTSEND
    ALERTSEND --> ALERTS_LOG
    ALERTS_LOG --> DASHBOARD
    EVENTS --> DASHBOARD

    ALERTSEND -->|"warning or alert"| TELEGRAM
    ALERTSEND -->|"alert level only"| WHATSAPP
```

## Rules Engine

The rules engine (`rules_engine.gs`) polls every 10 minutes and evaluates four configurable rules against the EVENTS sheet:

| Rule ID | Trigger |
|---|---|
| `no_movement` | No phone accelerometer movement for N hours |
| `no_phone_usage` | No calls or notifications for N hours |
| `no_morning` | No activity from any source after 6 AM |
| `combined_silence` | No signal from phone, Alexa, or CCTV for N hours |

A 60-minute cooldown prevents duplicate alerts for the same rule. Warnings send to Telegram only; alerts send to both Telegram and WhatsApp via CallMeBot.
