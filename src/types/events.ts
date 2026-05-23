// Shared types for disaster events across components
export interface UnifiedDisasterEvent {
  id: string;
  type: 'wildfire' | 'earthquake';
  title: string;
  description: string;
  timestamp: string;
  coords: [number, number]; // [lat, lng]
  magnitude?: number;
  depth?: number;
  link: string;
  source: string;
  locationName: string;
}

export interface EventsAPIResponse {
  success: boolean;
  timestamp: string;
  count: number;
  events: UnifiedDisasterEvent[];
  errors?: string[];
}
