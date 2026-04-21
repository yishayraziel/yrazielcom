// GET /oauth/auth — start the GitHub OAuth flow.
// Redirects the user to GitHub with the configured client_id + scope.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'github';

  if (provider !== 'github') {
    return new Response('Unsupported provider', { status: 400 });
  }

  const redirectUri = `${url.origin}/oauth/callback`;
  const state = crypto.randomUUID();

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'repo,user');
  authorize.searchParams.set('state', state);

  return Response.redirect(authorize.toString(), 302);
}
