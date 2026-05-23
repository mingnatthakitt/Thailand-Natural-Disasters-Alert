# Thailand & Greater Indochina Disaster Watch

[![Next.js 16](https://img.shields.io/badge/next.js-16.2-black.svg?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/react-19-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5-blue.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/tailwind-4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/deploy-Vercel-black?style=flat&logo=vercel&logoColor=white)](https://vercel.com/)
[![NASA EONET](https://img.shields.io/badge/data-NASA%20EONET-2E4057?style=flat&logo=nasa&logoColor=white)](https://eonet.gsfc.nasa.gov/)
[![USGS](https://img.shields.io/badge/data-USGS-3E7D1C?style=flat&logo=usgs&logoColor=white)](https://earthquake.usgs.gov/)

<br>

<div align="center">

[![Dashboard](https://img.shields.io/badge/Dashboard-Vercel-black?style=for-the-badge&logo=vercel&logoColor=white)](https://thailand-natural-disasters-alert.vercel.app)
[![Invite Bot](https://img.shields.io/badge/Discord-Invite_Bot-7289da?logo=discord&logoColor=white&style=for-the-badge)](https://discord.com/oauth2/authorize?client_id=1507757177144741978&permissions=18448&integration_type=0&scope=bot)

</div>

<br>

Real-time monitoring and alerting for **wildfires**, **earthquakes**, and **tropical cyclones** across Thailand, Myanmar, Laos, Cambodia, Vietnam, and Malaysia.

Data sourced from **NASA EONET** (satellite thermal anomalies + cyclone tracks) and **USGS** (seismic events), with Discord push notifications to every server the bot is in.

<p align="center">
  <img src="public/dashboard.png" width="80%" alt="Dashboard preview" />
</p>

---

## Features

### Map
- Leaflet map centered on Greater Indochina (`95°E–107.5°E`, `4°N–22.5°N`)
- **Fire markers** — pulsing orange rings for wildfires from NASA MODIS/VIIRS satellite data
- **Seismic markers** — size-scaled circles (M2+) color-coded by magnitude
- **Storm markers** — 🌪️ icon for tropical cyclones, color-coded by wind speed (cyan <34kt → red ≥64kt Typhoon)
- Click any marker to fly the map and open a details popup

### Dashboard
- Live stat counters: Active Fires · Earthquakes (7d) · Max Magnitude · Active Storms
- Searchable, filterable sidebar event feed (All / 🔥 Fires / 🌋 Quakes / 🌪️ Storms)
- Auto-refresh every 5 minutes via `/api/events`

### Automated Alert Pipeline
- Cron-job.org hits `/api/check-disasters` every 15 minutes
- Fetches USGS + NASA EONET (wildfires + severeStorms) in parallel via `Promise.allSettled`
- Sends color-coded Discord embeds to **all registered servers** simultaneously
- Only fresh events (≤90 min old) trigger alerts — prevents spam on ongoing events
- Graceful degradation: if one data source fails, the others still run

### Multi-Server Bot
- **Zero-setup** for server admins — just invite the bot
- Bot auto-creates `#thailand-natural-disasters-alert` in every server it joins
- `/api/guild-sync` discovers all joined servers, creates channels, registers them in Redis
- Call `/api/guild-sync` manually or via cron to sync new servers
- Alerts broadcast to every registered channel at the same time

---

## API Endpoints

| Endpoint | Method | Description |
|:---|:---|:---|
| `/api/events` | GET | Map data: all active fires + 7-day M2+ earthquakes |
| `/api/check-disasters` | GET | Cron target — fetches live data, sends Discord alerts for fresh events |
| `/api/check-disasters?test=1` | GET | Sends a test earthquake embed to all registered channels |
| `/api/check-disasters` | POST | Send a test embed to any specific channel ID `{ channelId, type? }` |
| `/api/guild-sync` | GET | Syncs all bot servers — creates channels, registers in Redis |
| `/api/guild-sync?dryrun=1` | GET | Preview all joined servers without making changes |
| `/api/guild-sync?guildId=xxx` | GET | Sync a specific server only |
| `/api/discord-interactions` | GET | Handles Discord Interactions Endpoint URL verification |

---

## Setup

### 1. Invite the Bot

Use this OAuth link to add the bot to any server (requires **Manage Channels** permission):
```
https://discord.com/oauth2/authorize?client_id=1507757177144741978&permissions=18448&integration_type=0&scope=bot
```

### 2. Sync Servers

After adding the bot to a server, call `/api/guild-sync` to:
- Create `#thailand-natural-disasters-alert` in each server
- Send a green ✅ confirmation embed to the new channel
- Register the channel in Upstash Redis

### 3. Cron Job

Set up a cron job at [cron-job.org](https://cron-job.org) to call `/api/check-disasters` every 15 minutes:

```
URL: https://thailand-natural-disasters-alert.vercel.app/api/check-disasters
Schedule: */15 * * * *
Method: GET
```

---

## Environment Variables

Deploy to Vercel and set these environment variables:

| Variable | Description |
|:---|:---|
| `DISCORD_BOT_TOKEN` | Your Discord bot token (from Discord Developer Portal) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

No `DISCORD_CHANNEL_ID` needed — the bot auto-creates channels in each server.

---

## Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── check-disasters/     # Cron target + alert dispatcher
│   │   ├── events/               # Map data endpoint (USGS + EONET)
│   │   ├── guild-sync/          # Bot multi-guild sync
│   │   └── discord-interactions/ # Discord URL verification only
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── Dashboard.tsx
│   ├── EventSidebar.tsx
│   └── MapContainer.tsx
└── lib/
    ├── discord.ts    # Bot auth, channel management, broadcast helpers
    └── api-types.ts  # REGION bounds, isInRegion, toICT, shared types
```

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, TypeScript, Tailwind CSS 4, Lucide Icons |
| Map | Leaflet.js + React-Leaflet (client-only, SSR disabled) |
| Styling | CSS custom properties, glassmorphism panels |
| Backend | Next.js Route Handlers |
| Scheduler | cron-job.org (every 15 mins) |
| Alert Channel | Discord Bot (REST API v10, multi-guild) |
| Registry | Upstash Redis |
| Deployment | Vercel (auto-deploys on push to main) |

---

## Configuration

### Region Bounding Box

Edit `src/lib/api-types.ts`:

```typescript
export const REGION = {
  minLat: 4.0,   // Southern Malaysia
  maxLat: 22.5,  // Northern Myanmar/Laos
  minLng: 95.0,   // Western Myanmar
  maxLng: 107.5,  // Eastern Laos/Vietnam
};
```

### Alert Thresholds

| Setting | Default | Location |
|:---|:---|:---|
| Earthquake minimum magnitude | M2.0 | `check-disasters` route |
| Fresh event window | 90 minutes | `check-disasters` route |
| Earthquake map window | 7 days | `events` route |
| Fetch timeout | 8 seconds | `AbortSignal.timeout(8000)` |
| Auto-refresh interval | 5 minutes | `Dashboard.tsx` |

---

## ⚠️ Disclaimer

This platform is for informational and monitoring purposes only. Data is sourced from public APIs (NASA EONET, USGS) and may have latency. Do not rely on this tool as the sole source for emergency decision-making.
