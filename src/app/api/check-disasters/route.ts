import { broadcast, getBotToken, postToChannel, hasAlerted, markAlerted } from '@/lib/discord';
import { fetchEarthquakes, fetchWildfires, fetchStorms, buildPayload } from '@/lib/disaster-fetchers';
import type { DisasterEvent } from '@/lib/disaster-fetchers';

export async function GET(req: Request) {
  getBotToken(); // throws if missing

  const url = new URL(req.url);

  // Test mode: send a test embed to all registered channels
  if (url.searchParams.get('test') === '1') {
    const testEvent = {
      id: 'test_001',
      type: 'earthquake' as const,
      title: 'M 4.2 — Test Alert, Gulf of Thailand',
      mag: 4.2,
      lat: 9.1234,
      lng: 99.5678,
      depth: 12.5,
      timestamp: new Date().toISOString(),
      link: 'https://earthquake.usgs.gov/',
      location: 'Gulf of Thailand (Test)',
    };

    try {
      const result = await broadcast(buildPayload([testEvent]));
      return Response.json({ tested: true, event: testEvent, ...result });
    } catch (err) {
      return Response.json({ error: `Discord bot error: ${err}` }, { status: 502 });
    }
  }

  // Real mode: fetch all data sources in parallel
  const [eqResult, fwResult, stResult] = await Promise.allSettled([
    fetchEarthquakes(),
    fetchWildfires(),
    fetchStorms(),
  ]);

  const earthquakes = eqResult.status === 'fulfilled' ? eqResult.value : [];
  const wildfires = fwResult.status === 'fulfilled' ? fwResult.value : [];
  const storms = stResult.status === 'fulfilled' ? stResult.value : [];

  if (eqResult.status === 'rejected') console.error('USGS failed:', eqResult.reason);
  if (fwResult.status === 'rejected') console.error('EONET wildfires failed:', fwResult.reason);
  if (stResult.status === 'rejected') console.error('EONET severeStorms failed:', stResult.reason);

  const events = [...earthquakes, ...wildfires, ...storms];
  const errors: string[] = [
    ...(eqResult.status === 'rejected' ? [String(eqResult.reason)] : []),
    ...(fwResult.status === 'rejected' ? [String(fwResult.reason)] : []),
    ...(stResult.status === 'rejected' ? [String(stResult.reason)] : []),
  ];

  // Freshness window: configurable via env var for testing.
  // Default 90 minutes matches the 15-min cron cadence (6 chances per event).
  // Set FRESH_WINDOW_MINUTES to e.g. 10080 (= 7 days) to force-broadcast every
  // event currently in the fetcher window. Useful for verifying the alert path.
  const FRESH_WINDOW_MS = (Number(process.env.FRESH_WINDOW_MINUTES) || 90) * 60 * 1000;
  const recent = events.filter((e) => Date.now() - new Date(e.timestamp).getTime() < FRESH_WINDOW_MS);

  let result = { sent: 0, failed: 0 };
  if (recent.length > 0) {
    // First-seen dedup: only alert for events we've never alerted on.
    // Survives missed cron runs and temporarily failing fetchers.
    const unseen = (
      await Promise.all(
        recent.map(async (e) => ((await hasAlerted(e.id)) ? null : e)),
      )
    ).filter((e): e is DisasterEvent => e !== null);

    if (unseen.length > 0) {
      try {
        result = await broadcast(buildPayload(unseen));
        // Mark only after a successful broadcast attempt. Errors from
        // broadcast() are caught below so they won't reach markAlerted.
        await Promise.all(unseen.map((e) => markAlerted(e.id)));
      } catch (e) {
        console.error('Discord broadcast failed:', (e as Error).message);
        result = { sent: 0, failed: 0 };
      }
    }
  }

  return Response.json({ checked: events.length, fresh: recent.length, ...result, errors: errors.length ? errors : undefined });
}

// ─── Manual test endpoint ───────────────────────────────────────────────────────
// POST /api/check-disasters with { channelId } in body to send a test message
// to any channel directly — bypasses Redis registration.
export async function POST(req: Request) {
  getBotToken();

  let body: { channelId?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.channelId) {
    return Response.json(
      { error: 'Missing field: channelId. Provide a Discord channel ID to send a test message to.' },
      { status: 400 },
    );
  }

  const testEvent: { id: string; type: 'wildfire' | 'earthquake' | 'storm'; title: string; mag: number; lat: number; lng: number; depth: number; timestamp: string; link: string; location: string } = {
    id: 'test_manual',
    type: (body.type === 'wildfire' ? 'wildfire' : body.type === 'storm' ? 'storm' : 'earthquake'),
    title: body.type === 'wildfire'
      ? 'Wildfire Detected — Chiang Mai Province'
      : body.type === 'storm'
        ? 'Typhoon — South China Sea'
        : 'M 4.5 — Test Earthquake, Bangkok Region',
    mag: 4.5,
    lat: 13.7563,
    lng: 100.5018,
    depth: 10.0,
    timestamp: new Date().toISOString(),
    link: 'https://earthquake.usgs.gov/',
    location: 'Bangkok, Thailand (Test)',
  };

  try {
    await postToChannel(body.channelId, buildPayload([testEvent]));
    return Response.json({
      success: true,
      channelId: body.channelId,
      event: testEvent,
    });
  } catch (err) {
    return Response.json({ error: `Failed to send: ${err}` }, { status: 502 });
  }
}
