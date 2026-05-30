// ─── Shared utilities ─────────────────────────────────────────────────────────

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

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
