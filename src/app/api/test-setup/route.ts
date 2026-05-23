/**
 * GET /api/test-setup?guildId=xxx
 *
 * Fully tests the bot setup flow for a given guild:
 *   1. ensureChannel() — creates #thailand-natural-disasters-alert (or finds existing)
 *   2. registerGuild() — stores guildId:channelId in Redis
 *   3. Sends a test embed to the newly registered channel
 *
 * You can get your guildId by enabling Developer Mode in Discord, then
 * right-clicking your server icon → "Copy Server ID".
 */
import { ensureChannel, registerGuild, getBotToken } from '@/lib/discord';
import { toICT } from '@/lib/api-types';

export async function GET(req: Request) {
  getBotToken(); // validate env

  const url = new URL(req.url);
  const guildId = url.searchParams.get('guildId');

  if (!guildId) {
    return Response.json(
      { error: 'Missing required param: guildId. Enable Developer Mode in Discord, right-click your server icon, and copy the Server ID.' },
      { status: 400 },
    );
  }

  if (!/^\d{17,19}$/.test(guildId)) {
    return Response.json({ error: 'guildId must be a numeric Discord snowflake (17-19 digits)' }, { status: 400 });
  }

  try {
    const channelId = await ensureChannel(guildId, `guild_${guildId}`);
    await registerGuild(guildId, channelId);

    // Send a test embed so they can verify it's actually in the channel
    const payload = {
      content: '✅ **Disaster Alert Bot — Setup Verified!**',
      embeds: [
        {
          color: 0x00ff00,
          title: '✅ Bot Setup Complete',
          description: `This channel (#thailand-natural-disasters-alert) is registered and ready.\n\nWhen a disaster is detected in the Greater Indochina region, alerts will be posted here automatically.`,
          fields: [
            { name: 'Guild ID', value: guildId, inline: true },
            { name: 'Channel ID', value: channelId, inline: true },
            { name: 'Local Time (ICT)', value: toICT(new Date().toISOString()), inline: true },
          ],
          footer: { text: 'Thailand & Greater Indochina Disaster Watch · NASA EONET & USGS' },
          timestamp: new Date().toISOString(),
        },
      ],
    };

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
      return Response.json({ error: `Discord send failed ${res.status}: ${text}` }, { status: 502 });
    }

    return Response.json({
      success: true,
      guildId,
      channelId,
      channelUrl: `https://discord.com/channels/${guildId}/${channelId}`,
      message: 'Channel created/found, registered in Redis, and test message sent!',
    });
  } catch (err) {
    console.error('[test-setup] Error:', err);
    return Response.json({ error: `Setup failed: ${err}` }, { status: 502 });
  }
}
