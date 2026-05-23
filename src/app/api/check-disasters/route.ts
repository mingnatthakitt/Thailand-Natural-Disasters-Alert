// ─── Region bounds ────────────────────────────────────────────────────────────
const REGION = {
  minLat: 4.0, maxLat: 22.5,
  minLng: 95.0, maxLng: 107.5,
};

// ─── API types ────────────────────────────────────────────────────────────────
interface USGSFeature {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    url: string;
    magType: string;
  };
  geometry: { coordinates: [number, number, number] };
}

interface EONETEvent {
  id: string;
  title: string;
  description: string;
  geometrie: { coordinates: [number, number] } | null;
  startDate: string;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isInRegion(lat: number, lng: number) {
  return lat >= REGION.minLat && lat <= REGION.maxLat && lng >= REGION.minLng && lng <= REGION.maxLng;
}

function toICT(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Bangkok',
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) + ' ICT';
}

interface DisasterEvent {
  id: string;
  type: 'wildfire' | 'earthquake';
  title: string;
  mag?: number;
  lat: number;
  lng: number;
  depth?: number;
  timestamp: string;
  link: string;
  location: string;
}

async function fetchEarthquakes(): Promise<DisasterEvent[]> {
  const starttime = new Date(Date.now() - 45 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${starttime}` +
    `&minlatitude=${REGION.minLat}&maxlatitude=${REGION.maxLat}` +
    `&minlongitude=${REGION.minLng}&maxlongitude=${REGION.maxLng}&minmagnitude=2`;

  const res = await fetch(url);
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
    `https://eonet.arc.nasa.gov/api/v3/events?bbox=${bbox}&status=open&category=wildfires&limit=50`,
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
        link: e.sources?.[0]?.url || 'https://eonet.arc.nasa.gov',
        location: e.title?.split('(')[0]?.trim() || 'Indochina region',
      };
    });
}

// ─── Discord Embed ────────────────────────────────────────────────────────────
async function notifyDiscord(events: DisasterEvent[], webhookUrl: string) {
  if (!webhookUrl || events.length === 0) return;

  const embeds = events.map((e) => {
    const color = e.type === 'wildfire' ? 0xe67e22 : 0xff0000;
    const emoji = e.type === 'wildfire' ? '🔥' : '⚠️';
    const title = e.type === 'wildfire' ? `${emoji} Wildfire Alert` : `${emoji} Seismic Activity Detected`;

    return {
      color,
      title,
      description: `**${e.title}**`,
      fields: [
        { name: 'Location', value: e.location, inline: true },
        { name: 'Local Time', value: toICT(e.timestamp), inline: true },
        ...(e.mag != null ? [{ name: 'Magnitude', value: `M${e.mag.toFixed(1)}`, inline: true }] : []),
        ...(e.depth != null ? [{ name: 'Depth', value: `${e.depth.toFixed(1)} km`, inline: true }] : []),
        { name: 'Coordinates', value: `${e.lat.toFixed(4)}°N, ${e.lng.toFixed(4)}°E`, inline: true },
      ],
      url: e.link,
      timestamp: e.timestamp,
      footer: { text: 'Siam & Greater Indochina Disaster Watch · NASA EONET & USGS' },
    };
  });

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds }),
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return Response.json({ error: 'DISCORD_WEBHOOK_URL not configured' }, { status: 500 });
  }

  // Test mode: send a fake alert to verify Discord webhook is working
  const url = new URL(req.url);
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
    await notifyDiscord([testEvent], webhookUrl);
    return Response.json({ tested: true, event: testEvent });
  }

  let earthquakes: DisasterEvent[] = [];
  let wildfires: DisasterEvent[] = [];

  try {
    [earthquakes, wildfires] = await Promise.all([fetchEarthquakes(), fetchWildfires()]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 502 });
  }

  const events = [...earthquakes, ...wildfires];
  await notifyDiscord(events, webhookUrl);

  return Response.json({ checked: events.length, events });
}
