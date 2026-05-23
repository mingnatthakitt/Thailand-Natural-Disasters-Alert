/**
 * Handles Discord's URL verification GET challenge.
 * Discord calls this to verify the Interactions Endpoint URL works.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const challenge = url.searchParams.get('challenge');
  return new Response(challenge ?? 'OK', { status: 200 });
}
