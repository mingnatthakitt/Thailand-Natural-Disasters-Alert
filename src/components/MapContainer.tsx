'use client';

import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import type { UnifiedDisasterEvent } from '@/types/events';

interface MapContainerProps {
  events: UnifiedDisasterEvent[];
  selectedEventId: string | null;
  onMarkerClick: (id: string) => void;
}

// Bounding box for the expanded Indochina region
const REGION_BOUNDS: L.LatLngBoundsExpression = [
  [4.0, 95.0],   // SW corner
  [22.5, 107.5],  // NE corner
];
const CENTER: L.LatLngExpression = [15.0, 101.0];

function createFireIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="fire-marker-glow" style="width:14px;height:14px;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function createEarthquakeIcon(mag: number) {
  const size = Math.max(16, Math.min(40, mag * 8));
  const color = mag >= 5 ? '#FF0055' : mag >= 4 ? '#FF4444' : '#FF6B6B';
  return L.divIcon({
    className: '',
    html: `
      <div class="seismic-pulse" style="width:${size}px;height:${size}px;">
        <div style="
          width:${size}px;height:${size}px;
          border-radius:50%;
          background:${color};
          opacity:0.85;
          display:flex;align-items:center;justify-content:center;
          font-size:${Math.max(9, size * 0.35)}px;
          font-weight:700;color:#fff;
          z-index:2;position:relative;
        ">${mag.toFixed(1)}</div>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createStormIcon(windSpeed?: number) {
  // Color by wind speed: Typhoon ≥64kt, Severe TS 48-63kt, TS 34-47kt, TD <34kt
  const color = windSpeed != null
    ? (windSpeed >= 64 ? '#A855F7' : windSpeed >= 48 ? '#7C3AED' : windSpeed >= 34 ? '#6B7280' : '#9CA3AF')
    : '#6B7280';
  const glowColor = windSpeed != null
    ? (windSpeed >= 64 ? '#A855F7' : windSpeed >= 48 ? '#7C3AED' : '#6B7280')
    : '#6B7280';
  const label = windSpeed != null
    ? (windSpeed >= 64 ? 'TYP' : windSpeed >= 48 ? 'STS' : windSpeed >= 34 ? 'TS' : 'TD')
    : 'TC';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;border-radius:50%;
      background:#1E293B;opacity:0.95;
      border:2px solid ${color};
      display:flex;align-items:center;justify-content:center;
      font-size:8.5px;font-weight:800;letter-spacing:0.5px;
      color:${color};font-family:monospace;
      box-shadow:0 0 10px ${glowColor}66, 0 2px 8px rgba(0,0,0,0.4);
    ">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function formatICT(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'Asia/Bangkok',
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    }) + ' ICT';
  } catch { return iso; }
}

export default function MapContainer({ events, selectedEventId, onMarkerClick }: MapContainerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: CENTER,
      zoom: 6,
      minZoom: 5,
      maxZoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark tile layer from CartoDB
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Zoom control in bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Attribution in bottom-left
    L.control.attribution({ position: 'bottomleft', prefix: false })
      .addAttribution('© <a href="https://carto.com/" target="_blank">CartoDB</a> · NASA · USGS')
      .addTo(map);

    // Bounding box overlay for the monitored region
    L.rectangle(REGION_BOUNDS, {
      color: '#00E5FF',
      weight: 1.5,
      opacity: 0.35,
      fillColor: '#00E5FF',
      fillOpacity: 0.04,
      dashArray: '8 6',
      interactive: false,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers with events prop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existingIds = new Set(markersRef.current.keys());
    const newIds = new Set(events.map(e => e.id));

    // Remove markers that are no longer in the event list
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    }

    // Add or update markers
    for (const event of events) {
      if (markersRef.current.has(event.id)) continue; // already on map

      const icon = event.type === 'wildfire'
        ? createFireIcon()
        : event.type === 'storm'
          ? createStormIcon(event.windSpeed)
          : createEarthquakeIcon(event.magnitude ?? 2.0);

      const marker = L.marker([event.coords[0], event.coords[1]], { icon }).addTo(map);

      const popupContent = `
        <div style="min-width:200px;font-family:var(--font-inter),sans-serif;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:${event.type === 'wildfire' ? '#FF7B00' : event.type === 'storm' ? '#A78BFA' : '#FF0055'};">
            ${event.type === 'wildfire' ? '🔥' : event.type === 'storm' ? '🌪️' : '🌋'} ${event.title}
          </div>
          <div style="font-size:11px;color:#94A3B8;margin-bottom:8px;">
            ${formatICT(event.timestamp)}
          </div>
          <div style="font-size:11.5px;line-height:1.5;color:#CBD5E1;margin-bottom:8px;">
            ${event.description}
          </div>
          <div style="display:flex;gap:12px;font-size:10.5px;color:#64748B;">
            <span>Lat: ${event.coords[0].toFixed(4)}</span>
            <span>Lng: ${event.coords[1].toFixed(4)}</span>
            ${event.depth != null ? `<span>Depth: ${event.depth.toFixed(1)}km</span>` : ''}
            ${event.windSpeed != null ? `<span>Wind: ${event.windSpeed.toFixed(0)} kt</span>` : ''}
          </div>
          <a href="${event.link}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;margin-top:8px;font-size:11px;color:#00E5FF;text-decoration:none;">
            View Source ↗
          </a>
        </div>
      `;
      marker.bindPopup(popupContent, { maxWidth: 280, closeButton: true });
      marker.on('click', () => onMarkerClick(event.id));
      markersRef.current.set(event.id, marker);
    }
  }, [events, onMarkerClick]);

  // Fly to selected event
  const flyToEvent = useCallback((eventId: string) => {
    const map = mapRef.current;
    if (!map) return;
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    map.flyTo([event.coords[0], event.coords[1]], 10, { duration: 1.2 });
    const marker = markersRef.current.get(eventId);
    if (marker) marker.openPopup();
  }, [events]);

  useEffect(() => {
    if (selectedEventId) flyToEvent(selectedEventId);
  }, [selectedEventId, flyToEvent]);

  return (
    <div
      ref={containerRef}
      id="disaster-map"
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ zIndex: 0 }}
    />
  );
}
