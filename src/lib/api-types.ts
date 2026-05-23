// Shared constants and types for both API routes

export const REGION = {
  minLat: 4.0,
  maxLat: 22.5,
  minLng: 95.0,
  maxLng: 107.5,
} as const;

export function isInRegion(lat: number, lng: number): boolean {
  return (
    lat >= REGION.minLat &&
    lat <= REGION.maxLat &&
    lng >= REGION.minLng &&
    lng <= REGION.maxLng
  );
}

export function toICT(iso: string): string {
  try {
    return (
      new Date(iso).toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) + ' ICT'
    );
  } catch {
    return iso;
  }
}

// ─── Shared API types ─────────────────────────────────────────────────────────

export interface USGSFeature {
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

export interface EONETEvent {
  id: string;
  title: string;
  description: string;
  geometrie: { coordinates: [number, number] } | null;
  startDate: string;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
  magnitudeValue?: number;
  magnitudeUnit?: string;
  magnitudeDescription?: string;
}
