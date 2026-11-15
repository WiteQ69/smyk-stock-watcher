# Stock checker

A scheduled Node.js collector for a personal stock monitor. Configuration is fetched from a private authenticated endpoint; Telegram credentials and persistent state stay on the coordinator. No personal location or credentials are committed here.

Runs nominally every five minutes. GitHub scheduled jobs can be delayed, and public-repository schedules may be disabled after 60 days without repository activity.
