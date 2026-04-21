// GET /oauth/callback?code=… — exchange the code for an access_token and
// return an HTML page that posts the result back to the CMS opener window,
// using the Decap/Sveltia-compatible message format.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return htmlResponse(renderMessage('github', { error: 'missing_code' }));
  }

  // Exchange the code for an access token.
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  let payload;
  try {
    const data = await tokenRes.json();
    if (data.error) {
      payload = { error: data.error_description || data.error };
    } else if (data.access_token) {
      payload = { token: data.access_token, provider: 'github' };
    } else {
      payload = { error: 'no_token' };
    }
  } catch (e) {
    payload = { error: 'bad_response' };
  }

  return htmlResponse(renderMessage('github', payload));
}

function renderMessage(provider, result) {
  // The CMS opener window listens for "authorizing:<provider>" then responds
  // with "authorized:<provider>". We reply with the token/error.
  const payload = JSON.stringify(result);
  // Escape for inclusion in inline JS string literal.
  const safe = payload.replace(/</g, '\\u003c').replace(/'/g, "\\'");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Authorizing…</title></head><body>
<script>
(function () {
  var result = ${safe};
  var messageKind = result.error ? 'error' : 'success';
  var message = 'authorization:${provider}:' + messageKind + ':' + JSON.stringify(result);
  function send(e) {
    if (!window.opener) return;
    window.opener.postMessage(message, e && e.origin ? e.origin : '*');
  }
  window.addEventListener('message', function (e) {
    if (String(e.data) === 'authorizing:${provider}') send(e);
  }, false);
  // Also push once on load in case the opener is already listening.
  send();
  setTimeout(function () { window.close(); }, 1500);
})();
</script>
<p>Finishing sign-in…</p>
</body></html>`;
}

function htmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
