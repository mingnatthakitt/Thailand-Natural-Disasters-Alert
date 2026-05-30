// Shared disaster data fetchers — used by both the public events API
// and the internal alert-broadcast endpoint.

import { REGION, isInRegion } from '@/lib/api-types';

export interface DisasterEvent {
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

async function fetchEarthquakes(): Promise<DisasterEvent[]> {
  const starttime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${starttime}` +
    `&minlatitude=${REGION.minLat}&maxlatitude=${REGION.maxLat}` +
    `&minlongitude=${REGION.minLng}&maxlongitude=${REGION.maxLng}&minmagnitude=2`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`USGS error: ${res.status}`);

  const data = await res.json() as { features: import('@/lib/api-types').USGSFeature[] };
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

  const data = await res.json() as { events: import('@/lib/api-types').EONETEvent[] };
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

  const data = await res.json() as { events: import('@/lib/api-types').EONETEvent[] };
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

export { fetchEarthquakes, fetchWildfires, fetchStorms };

// Build Discord embed payloads from disaster events
export function buildPayload(events: DisasterEvent[]) {
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
          { name: 'Local Time', value: new Date(e.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Bangkok', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ICT', inline: true },
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
