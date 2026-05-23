import { REGION, isInRegion, toICT } from '@/lib/api-types';
import type { USGSFeature, EONETEvent } from '@/lib/api-types';
import { broadcast, getBotToken } from '@/lib/discord';

interface DisasterEvent {
  id: string;
  type: 'wildfire' | 'earthquake' | 'storm';
  title: string;
  mag?: number;
  windSpeed?: number;
  lat: number;
  lng: number;
  depth?: number;
  timestamp: string;
  link: string;
  location: string;
}

// Build Discord message payloads
function buildPayload(events: DisasterEvent[]) {
  return {
    embeds: events.map((e) => {
      const color = e.type === 'wildfire' ? 0xe67e22 : e.type === 'storm' ? 0x0099ff : 0xff0000;
      const emoji = e.type === 'wildfire' ? '🔥' : e.type === 'storm' ? '🌪️' : '⚠️';
      const title = e.type === 'wildfire'
        ? `${emoji} Wildfire Alert`
        : e.type === 'storm'
          ? `${emoji} Tropical Cyclone Alert`
          : `${emoji} Seismic Activity Detected`;

      return {
        color,
        title,
        description: `**${e.title}**`,
        fields: [
          { name: 'Location', value: e.location, inline: true },
          { name: 'Local Time', value: toICT(e.timestamp), inline: true },
          ...(e.mag != null ? [{ name: e.type === 'storm' ? 'Wind Speed' : 'Magnitude', value: e.type === 'storm' ? `${e.mag} kt` : `M${e.mag.toFixed(1)}`, inline: true }] : []),
          ...(e.depth != null ? [{ name: 'Depth', value: `${e.depth.toFixed(1)} km`, inline: true }] : []),
          { name: 'Coordinates', value: `${e.lat.toFixed(4)}°N, ${e.lng.toFixed(4)}°E`, inline: true },
        ],
        url: e.link,
        timestamp: e.timestamp,
        footer: { text: 'Thailand & Greater Indochina Disaster Watch · NASA EONET & USGS' },
      };
    }),
  };
}

// Send message to a specific channel via Discord REST API v10
async function postToChannel(channelId: string, payload: object): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${getBotToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord API ${res.status}: ${text}`);
  }
}

async function fetchEarthquakes(): Promise<DisasterEvent[]> {
  const starttime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${starttime}` +
    `&minlatitude=${REGION.minLat}&maxlatitude=${REGION.maxLat}` +
    `&minlongitude=${REGION.minLng}&maxlongitude=${REGION.maxLng}&minmagnitude=2`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`USGS error: ${res.status}`);

  const data = await res.json() as { features: USGSFeature[] };
  return data.features.map((f) => {
    const [lng, lat, depth] = f.geometry.coordinates;
    const place = f.properties.place || 'Unknown';
    return {
      id: `usgs_${f.id}`,
      type: 'earthquake' as const,
      title: `M${f.properties.mag.toFixed(1)} — ${place.split(',')[0].trim()}`,
      mag: f.properties.mag,
      lat, lng, depth,
      timestamp: new Date(f.properties.time).toISOString(),
      link: f.properties.url,
      location: place,
    };
  });
}

async function fetchWildfires(): Promise<DisasterEvent[]> {
  const bbox = `${REGION.minLng},${REGION.maxLat},${REGION.maxLng},${REGION.minLat}`;
  const res = await fetch(
    `https://eonet.gsfc.nasa.gov/api/v3/events?bbox=${bbox}&status=open&category=wildfires&limit=50`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`EONET error: ${res.status}`);

  const data = await res.json() as { events: EONETEvent[] };
  return data.events
    .filter((e) => {
      if (!e.geometrie) return false;
      const [lng, lat] = e.geometrie.coordinates;
      return isInRegion(lat, lng);
    })
    .map((e) => {
      const [lng, lat] = e.geometrie!.coordinates;
      return {
        id: `eonet_${e.id}`,
        type: 'wildfire' as const,
        title: e.title || 'Wildfire Detected',
        lat, lng,
        timestamp: e.startDate,
        link: e.sources?.[0]?.url || 'https://eonet.gsfc.nasa.gov',
        location: e.title?.split('(')[0]?.trim() || 'Indochina region',
      };
    });
}

async function fetchStorms(): Promise<DisasterEvent[]> {
  const bbox = `${REGION.minLng},${REGION.maxLat},${REGION.maxLng},${REGION.minLat}`;
  const res = await fetch(
    `https://eonet.gsfc.nasa.gov/api/v3/events?bbox=${bbox}&status=open&category=severeStorms&limit=50`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`EONET severeStorms error: ${res.status}`);

  const data = await res.json() as { events: EONETEvent[] };
  return data.events
    .filter((e) => {
      if (!e.geometrie) return false;
      const [, lat] = e.geometrie.coordinates;
      return lat >= REGION.minLat && lat <= REGION.maxLat;
    })
    .map((e) => {
      const [lng, lat] = e.geometrie!.coordinates;
      const windKts = e.magnitudeValue;
      const stormType = windKts != null
        ? (windKts >= 64 ? 'Typhoon' : windKts >= 48 ? 'Severe Tropical Storm' : windKts >= 34 ? 'Tropical Storm' : 'Tropical Depression')
        : 'Tropical Cyclone';
      return {
        id: `eonet_storm_${e.id}`,
        type: 'storm' as const,
        title: `${stormType} — ${e.title}`,
        mag: windKts,
        windSpeed: windKts,
        lat, lng,
        timestamp: e.startDate,
        link: e.sources?.[0]?.url || 'https://eonet.gsfc.nasa.gov',
        location: e.title?.trim() || 'Indochina region',
      };
    });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  // Validate env (bot token only — channel is auto-created per guild)
  getBotToken(); // throws if missing

  const url = new URL(req.url);

  // Test mode: verify bot can send to all registered channels
  if (url.searchParams.get('test') === '1') {
    const testEvent: DisasterEvent = {
      id: 'test_001',
      type: 'earthquake',
      title: 'M 4.2 — Test Alert, Gulf of Thailand',
      mag: 4.2,
      lat: 9.1234,
      lng: 99.5678,
      depth: 12.5,
      timestamp: new Date().toISOString(),
      link: 'https://earthquake.usgs.gov/',
      location: 'Gulf of Thailand (Test)',
    };

    try {
      const result = await broadcast(buildPayload([testEvent]), postToChannel);
      return Response.json({ tested: true, event: testEvent, ...result });
    } catch (err) {
      return Response.json({ error: `Discord bot error: ${err}` }, { status: 502 });
    }
  }

  // Real mode: fetch all data sources in parallel
  const [eqResult, fwResult, stResult] = await Promise.allSettled([
    fetchEarthquakes(),
    fetchWildfires(),
    fetchStorms(),
  ]);

  const earthquakes = eqResult.status === 'fulfilled' ? eqResult.value : [];
  const wildfires = fwResult.status === 'fulfilled' ? fwResult.value : [];
  const storms = stResult.status === 'fulfilled' ? stResult.value : [];

  if (eqResult.status === 'rejected') console.error('USGS failed:', eqResult.reason);
  if (fwResult.status === 'rejected') console.error('EONET wildfires failed:', fwResult.reason);
  if (stResult.status === 'rejected') console.error('EONET severeStorms failed:', stResult.reason);

  const events = [...earthquakes, ...wildfires, ...storms];
  const errors: string[] = [
    ...(eqResult.status === 'rejected' ? [String(eqResult.reason)] : []),
    ...(fwResult.status === 'rejected' ? [String(fwResult.reason)] : []),
    ...(stResult.status === 'rejected' ? [String(stResult.reason)] : []),
  ];

  // Only notify for fresh events (within last 90 minutes)
  const FRESH_WINDOW_MS = 90 * 60 * 1000;
  const recent = events.filter((e) => Date.now() - new Date(e.timestamp).getTime() < FRESH_WINDOW_MS);

  let result = { sent: 0, failed: 0 };
  if (recent.length > 0) {
    result = await broadcast(buildPayload(recent), postToChannel)
      .catch((e) => {
        console.error('Discord broadcast failed:', e.message);
        return { sent: 0, failed: 0 };
      });
  }

  return Response.json({ checked: events.length, fresh: recent.length, ...result, errors: errors.length ? errors : undefined });
}
