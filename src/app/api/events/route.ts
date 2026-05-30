import { REGION, isInRegion } from '@/lib/api-types';
import type { UnifiedDisasterEvent } from '@/types/events';
import { fetchEarthquakes, fetchWildfires, fetchStorms } from '@/lib/disaster-fetchers';

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

  const events: UnifiedDisasterEvent[] = [...earthquakes, ...wildfires, ...storms]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      description: buildDescription(e),
      timestamp: e.timestamp,
      coords: [e.lat, e.lng] as [number, number],
      magnitude: e.mag,
      depth: e.depth,
      windSpeed: e.windSpeed,
      link: e.link,
      source: e.type === 'earthquake' ? 'USGS' : 'NASA EONET',
      locationName: e.location,
    }));

  return Response.json({
    success: errors.length === 0,
    timestamp: new Date().toISOString(),
    count: events.length,
    events,
    errors: errors.length ? errors : undefined,
  });
}

function buildDescription(e: { type: string; mag?: number; windSpeed?: number }): string {
  if (e.type === 'earthquake') return `Magnitude ${e.mag?.toFixed(1)} earthquake recorded in the Greater Indochina region.`;
  if (e.type === 'storm' && e.windSpeed != null) return `Tropical cyclone with sustained winds of ${e.windSpeed.toFixed(0)} kt detected in the Greater Indochina region.`;
  if (e.type === 'storm') return `Tropical cyclone detected in the Greater Indochina region.`;
  return `Thermal anomaly / wildfire detected via satellite in the Indochina region.`;
}
