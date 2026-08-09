const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://cloud.umami.is; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https://cloudflareinsights.com https://gateway.umami.is; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    secured.headers.set(name, value);
  }
  return secured;
}

function jsonResponse(body, status) {
  return withSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

const MAX_WAITLIST_BODY_BYTES = 1024;
const WAITLIST_RATE_LIMIT = 5;
const WAITLIST_RATE_WINDOW_SECONDS = 60;

// Soft per-IP limiter on the waitlist KV namespace. KV is eventually
// consistent, so bursts can exceed the limit slightly; that is acceptable
// for abuse resistance on a low-value write endpoint.
//
// Rate-limit keys use the `rl:` prefix so a waitlist export can exclude them
// (email entries are keyed by the address itself). CF-Connecting-IP is set for
// all real edge traffic; header-less requests share one `rl:noip` bucket so
// they are still limited rather than bypassing the check.
async function waitlistRateLimited(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'noip';
  const key = `rl:${ip}`;
  const count = parseInt((await env.musing_waitlist.get(key)) || '0', 10);
  if (count >= WAITLIST_RATE_LIMIT) return true;
  await env.musing_waitlist.put(key, String(count + 1), {
    expirationTtl: WAITLIST_RATE_WINDOW_SECONDS,
  });
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle waitlist form submission
    if (url.pathname === '/api/waitlist' && request.method === 'POST') {
      if (await waitlistRateLimited(request, env)) {
        return jsonResponse({ success: false, message: 'Too many requests. Please try again later.' }, 429);
      }

      const declaredLength = parseInt(request.headers.get('Content-Length') || '0', 10);
      if (declaredLength > MAX_WAITLIST_BODY_BYTES) {
        return jsonResponse({ success: false, message: 'Request too large.' }, 413);
      }

      const rawBody = await request.text();
      if (rawBody.length > MAX_WAITLIST_BODY_BYTES) {
        return jsonResponse({ success: false, message: 'Request too large.' }, 413);
      }

      let email;
      try {
        ({ email } = JSON.parse(rawBody));
      } catch (error) {
        return jsonResponse({ success: false, message: 'Invalid request body.' }, 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof email !== 'string' || email.length > 254 || !emailRegex.test(email)) {
        return jsonResponse(
          { success: false, message: 'Please enter a valid email address.' },
          400
        );
      }

      try {
        const key = email.toLowerCase();
        const existing = await env.musing_waitlist.get(key);
        if (!existing) {
          const data = {
            timestamp: new Date().toISOString(),
            userAgent: request.headers.get('User-Agent') || 'unknown',
          };
          await env.musing_waitlist.put(key, JSON.stringify(data));
        }
        // Same response whether the address is new or already stored,
        // so the endpoint cannot be used to enumerate emails.
        return jsonResponse(
          { success: true, message: "You're on the list! We'll notify you when Musing launches." },
          200
        );
      } catch (error) {
        return jsonResponse(
          { success: false, message: 'Something went wrong. Please try again.' },
          500
        );
      }
    }

    // Clean, valid robots.txt served from the Worker so it is not shaped by an
    // edge-injected directive Lighthouse flags as unknown.
    if (url.pathname === '/robots.txt') {
      return withSecurityHeaders(
        new Response('User-agent: *\nAllow: /\nSitemap: https://musing.wiki/sitemap.xml\n', {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
        })
      );
    }

    if (url.pathname === '/sitemap.xml') {
      const pages = ['/', '/privacy.html', '/terms.html'];
      const body =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages.map((p) => `  <url><loc>https://musing.wiki${p}</loc></url>`).join('\n') +
        '\n</urlset>\n';
      return withSecurityHeaders(
        new Response(body, {
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
        })
      );
    }

    // Umami analytics load directly from cloud.umami.is (script) and report to
    // gateway.umami.is (collect); both are allowlisted in the CSP above.

    // Proxy Cloudflare Insights script
    if (url.pathname === '/c/beacon.js') {
      const response = await fetch('https://static.cloudflareinsights.com/beacon.min.js');
      if (!response.ok) {
        return withSecurityHeaders(
          new Response(response.body, {
            status: response.status,
            headers: { 'Cache-Control': 'no-store' },
          })
        );
      }
      return withSecurityHeaders(
        new Response(response.body, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      );
    }

    // Serve static assets
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
