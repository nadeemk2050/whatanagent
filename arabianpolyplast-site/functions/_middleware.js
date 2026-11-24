// Canonical-host enforcement for Cloudflare Pages.
// www.arabianpolyplast.com -> https://arabianpolyplast.com (301, path + query kept).
const CANONICAL_HOST = 'arabianpolyplast.com';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.protocol = 'https:';
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
