'use client';

import { useState, useEffect, useCallback, useMemo, useTransition } from 'react';
import dynamic from 'next/dynamic';
import {
  Search,
  Flame,
  Activity,
  Radio,
  Shield,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { UnifiedDisasterEvent, EventsAPIResponse } from '@/types/events';
import EventSidebar from './EventSidebar';

// Dynamically import the Leaflet map with SSR disabled
const MapContainer = dynamic(() => import('./MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0B0D13]">
      <div className="text-slate-500 text-sm animate-pulse flex flex-col items-center gap-3">
        <Radio size={28} className="text-cyan-500/50" />
        Initializing satellite view...
      </div>
    </div>
  ),
});

export default function Dashboard() {
  const [events, setEvents] = useState<UnifiedDisasterEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'wildfire' | 'earthquake' | 'storm'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, startTransition] = useTransition();

  const fetchEvents = useCallback(async () => {
    startTransition(() => setLoading(true));
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: EventsAPIResponse = await res.json();
      startTransition(() => {
        setEvents(data.events);
        setLastUpdate(data.timestamp);
      });
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      startTransition(() => setLoading(false));
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchEvents, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Computed statistics
  const stats = useMemo(() => {
    const fires = events.filter((e) => e.type === 'wildfire');
    const quakes = events.filter((e) => e.type === 'earthquake');
    const storms = events.filter((e) => e.type === 'storm');
    const maxMag =
      quakes.length > 0
        ? Math.max(...quakes.map((q) => q.magnitude ?? 0))
        : 0;
    return { fires: fires.length, quakes: quakes.length, storms: storms.length, maxMag, total: events.length };
  }, [events]);

  // Determine data freshness
  const isFresh = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() < 5 * 60 * 1000 : false;

  const handleMarkerClick = useCallback((id: string) => {
    setSelectedEventId(id);
  }, []);

  // Filter events for the map (only by type, not search — search is sidebar-only)
  const mapEvents = useMemo(() => {
    if (typeFilter === 'all') return events;
    return events.filter((e) => e.type === typeFilter);
  }, [events, typeFilter]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* ─── Top Header Bar ─── */}
      <header className="glass-panel border-b border-white/[0.06] px-5 py-3 flex items-center gap-4 shrink-0 z-20">
        {/* Logo + Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-500/20">
            <Shield size={16} className="text-slate-200" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide font-[family-name:var(--font-outfit)]">
              Thailand & Greater Indochina Disaster Watch
            </h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">
              Near-real-time hazard monitoring · NASA EONET & USGS
            </p>
          </div>
        </div>

        {/* Live status indicator */}
        <div className="hidden md:flex items-center gap-2 ml-4 px-3 py-1.5 rounded-full glass-panel">
          <div className={`live-dot ${isFresh ? '' : 'stale'}`} />
          <span className="text-[10px] font-medium text-slate-400">{isFresh ? 'Live' : 'Stale'}</span>
        </div>

        {/* Stat counters */}
        <div className="hidden md:flex items-center gap-4 ml-auto mr-4">
          <StatChip
            icon={<Flame size={12} />}
            label="Active Fires"
            value={stats.fires}
            color="orange"
          />
          <StatChip
            icon={<Activity size={12} />}
            label="Earthquakes (7d)"
            value={stats.quakes}
            color="red"
          />
          <StatChip
            icon={<Activity size={12} />}
            label="Max Richter"
            value={stats.maxMag > 0 ? `M${stats.maxMag.toFixed(1)}` : '—'}
            color="cyan"
          />
          <StatChip
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M2 12h20M5.5 5.5l13 13M18.5 5.5l-13 13" />
              </svg>
            }
            label="Active Storms"
            value={stats.storms}
            color="slate"
          />
        </div>

        {/* Refresh + Last update */}
        <div className="flex items-center gap-3 ml-auto md:ml-0">
          {lastUpdate && (
            <span className="text-[10px] text-slate-500 hidden sm:block">
              Updated {new Date(lastUpdate).toLocaleTimeString('en-US', { timeZone: 'Asia/Bangkok', hour12: false })} ICT
            </span>
          )}
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="p-2 rounded-lg glass-panel hover:bg-white/[0.06] transition-all duration-200 disabled:opacity-40"
            title="Refresh data"
          >
            <RefreshCw size={14} className={`${loading ? 'spin-slow' : ''} text-slate-400`} />
          </button>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside
          className={`
            shrink-0 glass-panel border-r border-white/[0.06] flex flex-col z-10
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? 'w-80' : 'w-0'}
          `}
          style={{ overflow: sidebarOpen ? undefined : 'hidden' }}
        >
          {/* Search + Filters */}
          <div className="px-3 pt-3 pb-2 space-y-2 border-b border-white/[0.05]">
            {/* Search input */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white/[0.04] border border-white/[0.08]
                  text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40
                  focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
            </div>

            {/* Type filter pills */}
            <div className="flex gap-1.5">
              {(['all', 'wildfire', 'earthquake', 'storm'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`
                    flex-1 text-[10px] font-medium px-2 py-1.5 rounded-md transition-all duration-200
                    ${typeFilter === t
                      ? t === 'wildfire'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : t === 'earthquake'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : t === 'storm'
                            ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                            : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-white/[0.03] text-slate-500 border border-transparent hover:bg-white/[0.06]'
                    }
                  `}
                >
                  {t === 'all' ? 'All Events' : t === 'wildfire' ? '🔥 Fires' : t === 'earthquake' ? '🌋 Quakes' : '🌪️ Storms'}
                </button>
              ))}
            </div>
          </div>

          {/* Event list */}
          <EventSidebar
            events={events}
            selectedEventId={selectedEventId}
            onSelect={setSelectedEventId}
            searchQuery={searchQuery}
            typeFilter={typeFilter}
          />
        </aside>

        {/* Sidebar toggle button */}
        <button
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-r-lg glass-panel
            border border-l-0 border-white/[0.08] hover:bg-white/[0.06] transition-all duration-200"
          style={{ left: sidebarOpen ? '320px' : '0px', transition: 'left 0.3s ease-in-out' }}
        >
          {sidebarOpen ? <ChevronLeft size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
        </button>

        {/* Map Area */}
        <main className="flex-1 relative">
          <MapContainer
            events={mapEvents}
            selectedEventId={selectedEventId}
            onMarkerClick={handleMarkerClick}
          />

          {/* Floating legend */}
          <div className="absolute bottom-4 left-4 glass-panel rounded-lg px-3 py-2.5 z-10 space-y-1.5">
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Legend</div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(255,123,0,0.5)]" />
              Active Fire / Thermal Anomaly
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(255,0,85,0.5)]" />
              Earthquake (M ≥ 2.0)
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-4 h-4 rounded-full bg-[#1E293B] border border-slate-400 flex items-center justify-center shadow-[0_0_4px_rgba(100,116,139,0.4)]">
                <span className="text-[7px] font-bold text-slate-400" style={{ fontFamily: 'monospace' }}>TC</span>
              </span>
              Tropical Cyclone
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="w-3 h-3 border border-dashed border-cyan-400/50 rounded-sm" style={{ width: 12, height: 10 }} />
              Monitored Region Boundary
            </div>
          </div>

          {/* Loading overlay */}
          {loading && events.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0B0D13]/80 z-30">
              <div className="flex flex-col items-center gap-3">
                <Radio size={32} className="text-cyan-400 animate-pulse" />
                <span className="text-sm text-slate-400">Loading regional disaster data...</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── Stat Chip Sub-Component ─── */
function StatChip({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: 'orange' | 'red' | 'cyan' | 'slate';
}) {
  const colorMap = {
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', glow: 'glow-text-orange' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', glow: 'glow-text-red' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', glow: 'glow-text-cyan' },
    slate: { bg: 'bg-slate-500/10', text: 'text-slate-300', glow: 'glow-text-slate' },
  };
  const c = colorMap[color];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${c.bg}`}>
      <span className={c.text}>{icon}</span>
      <div>
        <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
        <div className={`text-sm font-bold ${c.text} ${c.glow}`}>{value}</div>
      </div>
    </div>
  );
}
