import { REGION, isInRegion } from '@/lib/api-types';
import type { UnifiedDisasterEvent } from '@/types/events';

export async function GET() {
  const [eqResult, fwResult, stResult] = await Promise.allSettled([
    fetchEarthquakes(),
    fetchWildfires(),
    fetchStorms(),
  ]);

  const earthquakes = eqResult.status === 'fulfilled' ? eqResult.value : [];
  const wildfires = fwResult.status === 'fulfilled' ? fwResult.value : [];
  const storms = stResult.status === 'fulfilled' ? stResult.value : [];

  const errors: string[] = [
    ...(eqResult.status === 'rejected' ? [String(eqResult.reason)] : []),
    ...(fwResult.status === 'rejected' ? [String(fwResult.reason)] : []),
    ...(stResult.status === 'rejected' ? [String(stResult.reason)] : []),
  ];

  const events = [...earthquakes, ...wildfires, ...storms].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return Response.json({
    success: errors.length === 0,
    timestamp: new Date().toISOString(),
    count: events.length,
    events,
    errors: errors.length ? errors : undefined,
  });
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchEarthquakes(): Promise<UnifiedDisasterEvent[]> {
  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
    `&starttime=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}` +
    `&minlatitude=${REGION.minLat}&maxlatitude=${REGION.maxLat}` +
    `&minlongitude=${REGION.minLng}&maxlongitude=${REGION.maxLng}&minmagnitude=2`;

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`USGS API error: ${res.status}`);

  const data = await res.json() as { features: import('@/lib/api-types').USGSFeature[] };
  return data.features.map((f) => {
    const [lng, lat, depth] = f.geometry.coordinates;
    const place = f.properties.place || 'Unknown location';
    return {
      id: `usgs_${f.id}`,
      type: 'earthquake' as const,
      title: `M${f.properties.mag.toFixed(1)} — ${place.split(',')[0].trim()}`,
      description: `Magnitude ${f.properties.mag.toFixed(1)} earthquake recorded in the Greater Indochina region.`,
      timestamp: new Date(f.properties.time).toISOString(),
      coords: [lat, lng] as [number, number],
      magnitude: f.properties.mag,
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

  const data = await res.json() as { events: import('@/lib/api-types').EONETEvent[] };
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
        link: e.sources?.[0]?.url || 'https://eonet.gsfc.nasa.gov',
        source: 'NASA EONET',
        locationName: e.title?.split('(')[0]?.trim() || 'Indochina region',
      };
    });
}

async function fetchStorms(): Promise<UnifiedDisasterEvent[]> {
  const bbox = `${REGION.minLng},${REGION.maxLat},${REGION.maxLng},${REGION.minLat}`;
  const res = await fetch(
    `https://eonet.gsfc.nasa.gov/api/v3/events?bbox=${bbox}&status=open&category=severeStorms&limit=50`,
    { next: { revalidate: 300 } },
  );
  if (!res.ok) throw new Error(`NASA EONET severeStorms error: ${res.status}`);

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
      const windDesc = windKts
        ? `${windKts.toFixed(0)} kt ${e.magnitudeDescription || ''}`.trim()
        : e.magnitudeDescription || '';
      const stormType = windKts != null
        ? (windKts >= 64 ? 'Typhoon' : windKts >= 48 ? 'Severe Tropical Storm' : windKts >= 34 ? 'Tropical Storm' : 'Tropical Depression')
        : 'Severe Storm';
      return {
        id: `eonet_storm_${e.id}`,
        type: 'storm' as const,
        title: `${stormType} — ${e.title}`,
        description: e.description ||
          (windDesc
            ? `Tropical cyclone with sustained winds of ${windDesc} detected in the Greater Indochina region.`
            : `Tropical cyclone detected in the Greater Indochina region.`),
        timestamp: e.startDate,
        coords: [lat, lng] as [number, number],
        magnitude: windKts,
        windSpeed: windKts,
        link: e.sources?.[0]?.url || 'https://eonet.gsfc.nasa.gov',
        source: 'NASA EONET',
        locationName: e.title?.trim() || 'Indochina region',
      };
    });
}
