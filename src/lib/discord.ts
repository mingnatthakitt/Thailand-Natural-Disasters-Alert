import { Redis } from '@upstash/redis';

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

async function discordFetch(path: string, options: RequestInit = {}): Promise<unknown> {
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

// ─── Channel management ─────────────────────────────────────────────────────────

/** Create or find the disaster alert channel in a guild */
export async function ensureChannel(guildId: string, guildName: string): Promise<string> {
  // 1. List existing channels to find our channel
  const existingChannels = (await discordFetch(
    `/guilds/${guildId}/channels`,
    { method: 'GET' },
  )) as Array<{ id: string; name: string; type: number }>;

  const existing = existingChannels.find((c) => c.name === CHANNEL_NAME && c.type === 0);
  if (existing) return existing.id;

  // 2. Create the channel
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
  // Find and remove the guild's entry
  const all = await redis.smembers(GUILD_CHANNEL_KEY);
  const toRemove = all.filter((m) => m.startsWith(`${guildId}:`));
  if (toRemove.length > 0) {
    await redis.srem(GUILD_CHANNEL_KEY, ...toRemove);
  }
}

// ─── Message sending ───────────────────────────────────────────────────────────

/** Send a payload to a specific channel */
export async function sendToChannel(channelId: string, payload: object): Promise<void> {
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

/** Broadcast an alert payload to all registered channels using the provided sender function */
export async function broadcast<T>(
  payload: object,
  sender: (channelId: string, payload: object) => Promise<T>,
): Promise<{ sent: number; failed: number }> {
  const channels = await getAllChannels();
  if (channels.length === 0) {
    console.log('[Discord] No registered channels — skipping broadcast');
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    channels.map(({ channelId }) => sender(channelId, payload)),
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (failed > 0) console.error(`[Discord] Broadcast: ${sent} sent, ${failed} failed`);
  else console.log(`[Discord] Broadcast: ${sent} channels notified`);

  return { sent, failed };
}
