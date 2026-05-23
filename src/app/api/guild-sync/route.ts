/**
 * GET /api/guild-sync
 *
 * Calls Discord's /users/@me/guilds endpoint using the bot token,
 * finds every server the bot is in, ensures each has a
 * #thailand-natural-disasters-alert channel, and registers all
 * guildId:channelId pairs in Redis.
 *
 * This replaces the slash command approach — no Interactions URL needed.
 * Run this manually (or via a cron) to sync all guilds.
 *
 * Optional params:
 *   ?guildId=xxx — sync a specific guild only
 *   ?dryrun=1    — list guilds without making changes
 */
import { ensureChannel, registerGuild, getAllChannels, getBotToken, sendConfirmation } from '@/lib/discord';

interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
  features: string[];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const singleGuildId = url.searchParams.get('guildId');
  const dryRun = url.searchParams.get('dryrun') === '1';

  // List all guilds the bot is in
  let guilds: DiscordGuild[];
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        Authorization: `Bot ${getBotToken()}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json(
        { error: `Discord API error ${res.status}: ${text}` },
        { status: 502 },
      );
    }

    guilds = await res.json() as DiscordGuild[];
  } catch (err) {
    return Response.json({ error: `Failed to fetch guilds: ${err}` }, { status: 502 });
  }

  // Filter to a single guild if requested
  if (singleGuildId) {
    guilds = guilds.filter((g) => g.id === singleGuildId);
    if (guilds.length === 0) {
      return Response.json(
        { error: `Bot is not in guild ${singleGuildId}` },
        { status: 404 },
      );
    }
  }

  if (dryRun) {
    return Response.json({
      dryRun: true,
      guilds: guilds.map((g) => ({ id: g.id, name: g.name })),
    });
  }

  // Process each guild
  const existingChannels = await getAllChannels();
  const existingMap = new Map(existingChannels.map((c) => [c.guildId, c.channelId]));

  const results: Array<{
    guildId: string;
    guildName: string;
    channelId: string | null;
    status: 'created' | 'found' | 'skipped' | 'error';
    error?: string;
  }> = [];

  for (const guild of guilds) {
    try {
      // Check if already registered
      if (existingMap.has(guild.id)) {
        results.push({
          guildId: guild.id,
          guildName: guild.name,
          channelId: existingMap.get(guild.id)!,
          status: 'found',
        });
        continue;
      }

      // Ensure channel and register
      const channelId = await ensureChannel(guild.id, guild.name);
      await registerGuild(guild.id, channelId);
      existingMap.set(guild.id, channelId); // prevent double-registration in same run

      // Send a confirmation message to the new channel
      await sendConfirmation(channelId, guild.name);

      results.push({
        guildId: guild.id,
        guildName: guild.name,
        channelId,
        status: 'created',
      });
    } catch (err) {
      console.error(`[guild-sync] Failed guild ${guild.id}:`, err);
      results.push({
        guildId: guild.id,
        guildName: guild.name,
        channelId: null,
        status: 'error',
        error: String(err),
      });
    }
  }

  const registered = results.filter((r) => r.status === 'created' || r.status === 'found').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return Response.json({
    totalGuilds: guilds.length,
    registered,
    errors,
    results,
  });
}
