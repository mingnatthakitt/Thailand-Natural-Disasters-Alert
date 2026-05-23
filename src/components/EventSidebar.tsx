'use client';

import { Flame, Activity, Clock, ExternalLink, MapPin } from 'lucide-react';
import type { UnifiedDisasterEvent } from '@/types/events';

interface EventSidebarProps {
  events: UnifiedDisasterEvent[];
  selectedEventId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  typeFilter: 'all' | 'wildfire' | 'earthquake';
}

function formatICT(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'Asia/Bangkok',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' ICT';
  } catch {
    return iso;
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function EventSidebar({
  events,
  selectedEventId,
  onSelect,
  searchQuery,
  typeFilter,
}: EventSidebarProps) {
  // Apply filters
  const filtered = events.filter((e) => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        e.locationName.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          Event Feed
          <span className="ml-auto text-xs font-normal text-slate-500">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </span>
        </h2>
      </div>

      {/* Scrollable event list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">
            <Activity size={28} className="mx-auto mb-3 opacity-30" />
            <p>No events match your filters.</p>
          </div>
        )}

        {filtered.map((event) => {
          const isSelected = event.id === selectedEventId;
          const isFireEvent = event.type === 'wildfire';

          return (
            <button
              key={event.id}
              onClick={() => onSelect(event.id)}
              className={`
                w-full text-left rounded-lg p-3 transition-all duration-200
                glass-panel-hover cursor-pointer group
                ${isSelected
                  ? 'bg-white/[0.08] border border-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.1)]'
                  : 'glass-panel'
                }
              `}
            >
              {/* Type badge + relative time */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`
                    inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
                    ${isFireEvent
                      ? 'bg-orange-500/15 text-orange-400'
                      : 'bg-red-500/15 text-red-400'
                    }
                  `}
                >
                  {isFireEvent ? <Flame size={10} /> : <Activity size={10} />}
                  {isFireEvent ? 'Fire' : `M${event.magnitude?.toFixed(1) ?? '?'}`}
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock size={9} />
                  {relativeTime(event.timestamp)}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-xs font-medium text-slate-200 leading-snug mb-1 line-clamp-2 group-hover:text-white">
                {event.title}
              </h3>

              {/* Location + coords */}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <MapPin size={9} className="shrink-0" />
                <span className="truncate">{event.locationName}</span>
              </div>

              {/* Footer: time + link */}
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/[0.05]">
                <span className="text-[10px] text-slate-500">
                  {formatICT(event.timestamp)}
                </span>
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-cyan-500 hover:text-cyan-300 flex items-center gap-0.5 transition-colors"
                >
                  Source <ExternalLink size={8} />
                </a>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
