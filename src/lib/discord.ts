import { Redis } from '@upstash/redis';
import { toICT } from './utils';

const redis = Redis.fromEnv();

export const CHANNEL_NAME = 'thailand-natural-disasters-alert';
const GUILD_CHANNEL_KEY = 'disaster:channels';

// ─── Auth ──────────────────────────────────────────────────────────────────────

export function getBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not configured');
  return token;
}

// ─── REST helpers ────────────────────────────────────────────────────────────────

export async function discordFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${getBotToken()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord API ${res.status}: ${text}`);
  }

  return res.json();
}

/** Send a payload to a specific channel */
export async function postToChannel(channelId: string, payload: object): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${getBotToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord API ${res.status}: ${text}`);
  }
}

// ─── Guild / channel registry (Redis) ──────────────────────────────────────────

/** Register a guild's alert channel in Redis */
export async function registerGuild(guildId: string, channelId: string): Promise<void> {
  await redis.sadd(GUILD_CHANNEL_KEY, `${guildId}:${channelId}`);
}

/** Get all registered guild+channel pairs */
export async function getAllChannels(): Promise<Array<{ guildId: string; channelId: string }>> {
  const members = await redis.smembers(GUILD_CHANNEL_KEY);
  return members.map((m) => {
    const [guildId, channelId] = m.split(':');
    return { guildId, channelId };
  });
}

/** Remove a guild from Redis (when bot leaves) */
export async function unregisterGuild(guildId: string): Promise<void> {
  const all = await redis.smembers(GUILD_CHANNEL_KEY);
  const toRemove = all.filter((m) => m.startsWith(`${guildId}:`));
  if (toRemove.length > 0) {
    await redis.srem(GUILD_CHANNEL_KEY, ...toRemove);
  }
}

// ─── Alert dedup (first-seen per event id) ─────────────────────────────────────

const ALERT_DEDUP_KEY = 'alert:sent';
const ALERT_DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60; // match USGS 7-day fetcher window

/** Returns true if we've already alerted on this event id. */
export async function hasAlerted(eventId: string): Promise<boolean> {
  const exists = await redis.sismember(ALERT_DEDUP_KEY, eventId);
  return exists === 1;
}

/** Mark an event as alerted. No-op if already marked. */
export async function markAlerted(eventId: string): Promise<void> {
  await redis.sadd(ALERT_DEDUP_KEY, eventId);
  await redis.expire(ALERT_DEDUP_KEY, ALERT_DEDUP_TTL_SECONDS);
}

/** Create or find the disaster alert channel in a guild */
export async function ensureChannel(guildId: string, guildName: string): Promise<string> {
  const existingChannels = (await discordFetch(
    `/guilds/${guildId}/channels`,
    { method: 'GET' },
  )) as Array<{ id: string; name: string; type: number }>;

  const existing = existingChannels.find((c) => c.name === CHANNEL_NAME && c.type === 0);
  if (existing) return existing.id;

  const created = await discordFetch(`/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: CHANNEL_NAME,
      topic: `Real-time disaster alerts for the Greater Indochina region (Thailand, Myanmar, Laos, Cambodia, Vietnam, Malaysia). Powered by NASA EONET & USGS.`,
      type: 0, // GUILD_TEXT
    }),
  }) as { id: string };

  console.log(`[Discord] Created #${CHANNEL_NAME} in guild ${guildId} (${guildName})`);
  return created.id;
}

// ─── Message sending ───────────────────────────────────────────────────────────

/** Send a green confirmation embed when a channel is registered */
export async function sendConfirmation(channelId: string, guildName: string): Promise<void> {
  const payload = {
    embeds: [{
      color: 0x00cc66,
      title: '✅ Thailand Disaster Alert — Channel Active',
      description: 'This channel is registered for real-time alerts covering the Greater Indochina region.',
      fields: [
        { name: 'Server', value: guildName, inline: true },
        { name: 'Registered (ICT)', value: toICT(new Date().toISOString()), inline: true },
        { name: 'Alerts', value: 'Earthquakes · Wildfires · Tropical Cyclones', inline: false },
      ],
      footer: { text: 'Thailand & Greater Indochina Disaster Watch · NASA EONET & USGS' },
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    await postToChannel(channelId, payload);
  } catch (err) {
    console.error(`[Discord] Failed to send confirmation to ${channelId}: ${err}`);
  }
}

/** Broadcast an alert payload to all registered channels */
export async function broadcast(payload: object): Promise<{ sent: number; failed: number }> {
  const channels = await getAllChannels();
  if (channels.length === 0) {
    console.log('[Discord] No registered channels — skipping broadcast');
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    channels.map(({ channelId }) => postToChannel(channelId, payload)),
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (failed > 0) console.error(`[Discord] Broadcast: ${sent} sent, ${failed} failed`);
  else console.log(`[Discord] Broadcast: ${sent} channels notified`);

  return { sent, failed };
}
