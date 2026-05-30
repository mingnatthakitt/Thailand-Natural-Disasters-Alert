'use client';

import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import type { UnifiedDisasterEvent } from '@/types/events';
import { toICT } from '@/lib/utils';

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
  const color = windSpeed != null
    ? (windSpeed >= 64 ? '#6366F1' : windSpeed >= 48 ? '#818CF8' : windSpeed >= 34 ? '#A0AEC0' : '#CBD5E1')
    : '#A0AEC0';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:#1E293B;opacity:0.9;
      border:2px solid ${color};
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:700;letter-spacing:0.3px;
      color:${color};font-family:monospace;
      box-shadow:0 0 10px ${color}55;
    ">🌪️</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
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

      const typeColor = event.type === 'wildfire' ? '#FF7B00' : event.type === 'storm' ? '#A78BFA' : '#FF0055';
      const typeEmoji = event.type === 'wildfire' ? '🔥' : event.type === 'storm' ? '🌪️' : '🌋';

      const popupContent = `
        <div style="
          min-width:220px;
          padding:16px;
          font-family:var(--font-inter),sans-serif;
          background:rgba(15,18,25,0.95);
          border:1px solid rgba(255,255,255,0.1);
          border-radius:12px;
          backdrop-filter:blur(16px);
          box-shadow:0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,255,0.1);
        ">
          <div style="
            font-weight:700;font-size:13px;margin-bottom:4px;
            color:${typeColor};
            display:flex;align-items:center;gap:6px;
          ">
            <span>${typeEmoji}</span>
            <span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${event.title}</span>
          </div>
          <div style="font-size:10px;color:#64748B;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06);">
            ${toICT(event.timestamp)}
          </div>
          <div style="font-size:11.5px;line-height:1.5;color:#CBD5E1;margin-bottom:12px;">
            ${event.description}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10px;color:#64748B;">
            <span style="background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:4px;">
              📍 ${event.coords[0].toFixed(3)}°N ${event.coords[1].toFixed(3)}°E
            </span>
            ${event.depth != null ? `<span style="background:rgba(255,0,85,0.1);padding:3px 8px;border-radius:4px;color:#FF0055;">${event.depth.toFixed(1)} km</span>` : ''}
            ${event.windSpeed != null ? `<span style="background:rgba(167,139,250,0.1);padding:3px 8px;border-radius:4px;color:#A78BFA;">${event.windSpeed.toFixed(0)} kt</span>` : ''}
          </div>
          <a href="${event.link}" target="_blank" rel="noopener noreferrer"
            style="
              display:inline-flex;align-items:center;gap:4px;
              margin-top:12px;padding-top:10px;
              font-size:11px;color:#00E5FF;text-decoration:none;
              border-top:1px solid rgba(255,255,255,0.06);
            ">
            View Source <span style="font-size:10px;">↗</span>
          </a>
        </div>
      `;
      marker.bindPopup(popupContent, { maxWidth: 300, closeButton: true });
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
      className="w-full h-full"
    >
      {/* Floating legend */}
      <div className="absolute bottom-4 left-4 z-20 glass-panel rounded-lg px-3 py-2.5 space-y-1.5 pointer-events-none">
        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Legend</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(255,123,0,0.5)]" />
          Active Fire
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(255,0,85,0.5)]" />
          Earthquake
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="w-4 h-4 rounded-full bg-[#1E293B] border border-slate-400 flex items-center justify-center shadow-[0_0_4px_rgba(100,116,139,0.4)]">
            <span className="text-[7px] font-bold text-slate-400" style={{ fontFamily: 'monospace' }}>TC</span>
          </span>
          Cyclone
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="w-3 h-3 border border-dashed border-cyan-400/50 rounded-sm" />
          Region Boundary
        </div>
      </div>

      {/* Region info overlay */}
      <div className="absolute top-4 right-4 z-20 region-overlay pointer-events-none">
        <div className="font-semibold text-cyan-400/80">Monitored Region</div>
        <div className="text-[10px] mt-1 opacity-70">
          4°N–22.5°N, 95°E–107.5°E
        </div>
      </div>
    </div>
  );
}
