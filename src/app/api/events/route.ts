import type { UnifiedDisasterEvent } from '@/types/events';

const REGION = {
  minLat: 4.0, maxLat: 22.5,
  minLng: 95.0, maxLng: 107.5,
};

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

function isInRegion(lat: number, lng: number) {
  return lat >= REGION.minLat && lat <= REGION.maxLat && lng >= REGION.minLng && lng <= REGION.maxLng;
}

async function fetchEarthquakes(): Promise<UnifiedDisasterEvent[]> {
  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
    `&starttime=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}` +
    `&minlatitude=${REGION.minLat}&maxlatitude=${REGION.maxLat}` +
    `&minlongitude=${REGION.minLng}&maxlongitude=${REGION.maxLng}&minmagnitude=2`;

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`USGS API error: ${res.status}`);
  const data = await res.json() as { features: USGSFeature[] };

  return data.features.map((f) => {
    const [lng, lat, depth] = f.geometry.coordinates;
    const mag = f.properties.mag;
    const place = f.properties.place || 'Unknown location';
    return {
      id: `usgs_${f.id}`,
      type: 'earthquake' as const,
      title: `M${mag.toFixed(1)} — ${place.split(',')[0].trim()}`,
      description: `Magnitude ${mag.toFixed(1)} earthquake recorded in the Greater Indochina region.`,
      timestamp: new Date(f.properties.time).toISOString(),
      coords: [lat, lng] as [number, number],
      magnitude: mag,
      depth,
      link: f.properties.url,
      source: 'USGS',
      locationName: place,
    };
  });
}

async function fetchWildfires(): Promise<UnifiedDisasterEvent[]> {
  const res = await fetch(
    'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=active&limit=50',
    { next: { revalidate: 300 } },
  );
  if (!res.ok) throw new Error(`NASA EONET API error: ${res.status}`);
  const data = await res.json() as { events: EONETEvent[] };

  return data.events
    .filter((e) => {
      if (!e.geometrie) return false;
      const [lng, lat] = e.geometrie.coordinates;
      return isInRegion(lat, lng);
    })
    .map((e) => {
      const [lng, lat] = e.geometrie!.coordinates;
      const category = e.categories?.[0]?.title || 'Wildfire';
      return {
        id: `eonet_${e.id}`,
        type: 'wildfire' as const,
        title: e.title || `${category} in progress`,
        description: e.description || `${category} detected via satellite in the Indochina region.`,
        timestamp: e.startDate,
        coords: [lat, lng] as [number, number],
        link: e.sources?.[0]?.url || 'https://eonet.arc.nasa.gov',
        source: 'NASA EONET',
        locationName: e.title?.split('(')[0]?.trim() || 'Indochina region',
      };
    });
}

export async function GET() {
  let earthquakes: UnifiedDisasterEvent[] = [];
  let wildfires: UnifiedDisasterEvent[] = [];

  try {
    [earthquakes, wildfires] = await Promise.all([fetchEarthquakes(), fetchWildfires()]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { success: false, timestamp: new Date().toISOString(), count: 0, events: [], errors: [message] },
      { status: 502 },
    );
  }

  const events = [...earthquakes, ...wildfires].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const timestamp = new Date().toISOString();

  return Response.json({ success: true, timestamp, count: events.length, events });
}
