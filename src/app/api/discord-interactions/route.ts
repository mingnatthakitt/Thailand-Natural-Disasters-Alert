import crypto from 'crypto';
import { ensureChannel, registerGuild } from '@/lib/discord';

/** Verify Discord interaction request signature using HMAC-SHA256 */
function verifySignature(body: string, signature: string, timestamp: string, publicKey: string): boolean {
  const expected = crypto
    .createHmac('sha256', Buffer.from(publicKey, 'hex'))
    .update(timestamp + body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

export async function POST(req: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!publicKey) {
    return Response.json({ error: 'DISCORD_PUBLIC_KEY not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-discord-signature') ?? '';
  const timestamp = req.headers.get('x-discord-timestamp') ?? '';

  // Verify request signature (prevents spoofing attacks)
  try {
    const isValid = verifySignature(rawBody, signature, timestamp, publicKey);
    if (!isValid) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { type } = body;

  // Handle Discord interaction types
  // https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-type
  switch (type) {
    case 1: // PING — respond with Pong immediately
      return Response.json({ type: 1 }); // PONG

    case 2: // APPLICATION_COMMAND — /setup or /register
      return handleCommand(body);

    case 3: // MESSAGE_COMPONENT — button clicks, etc.
      return Response.json({ type: 5 }); // DEFERRED_UPDATE_MESSAGE

    default:
      return Response.json({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  }
}

async function handleCommand(body: { data?: { name?: string; options?: Array<{ name: string; value: string }> }; guild_id?: string; guild?: { name?: string } }) {
  const commandName = body.data?.name ?? '';

  if (commandName === 'setup') {
    const guildId = body.guild_id;
    if (!guildId) {
      return Response.json(
        { type: 4, data: { content: '❌ This command must be used in a server.', flags: 64 } },
      );
    }

    try {
      const channelId = await ensureChannel(guildId, body.guild?.name ?? guildId);
      await registerGuild(guildId, channelId);

      return Response.json({
        type: 4,
        data: {
          content: `✅ **Disaster Alert Channel Setup Complete!**\n\nThe #thailand-natural-disasters-alert channel is ready. Alerts will be posted automatically. No further action needed.`,
          flags: 0,
        },
      });
    } catch (err) {
      console.error('[Discord] Setup command failed:', err);
      return Response.json(
        { type: 4, data: { content: `❌ Setup failed: ${err}`, flags: 64 } },
      );
    }
  }

  return Response.json({ type: 4, data: { content: 'Unknown command.' } });
}
