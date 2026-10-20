const BASE = 'https://framex.wolvarex.com';
const ALLOWED_PREFIXES = [
  '/api/v1/movies/trending',
  '/api/v1/movies/popular',
  '/api/v1/series/popular',
  '/api/v2/movies/trending',
  '/api/v1/search',
  '/api/v2/search',
  '/api/v1/categories',
  '/api/v1/genres',
  '/api/v1/movies/',
  '/api/play-links',
  '/api/download-links',
  '/api/bff/stream',
  '/api/cdn/stream'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const incoming = new URL(req.url, 'http://localhost');
  const path = incoming.searchParams.get('path');
  if (!path || !path.startsWith('/api/')) {
    return res.status(400).json({ error: 'Missing or invalid path parameter' });
  }
  const permitted = ALLOWED_PREFIXES.some(prefix => path === prefix || (prefix.endsWith('/') && path.startsWith(prefix)));
  if (!permitted) return res.status(403).json({ error: 'Endpoint is not permitted by this proxy' });

  const target = new URL(path, BASE);
  for (const [key, value] of incoming.searchParams.entries()) {
    if (key !== 'path') target.searchParams.append(key, value);
  }

  const headers = { Accept: 'application/json, text/plain, */*' };
  if (process.env.FRAMEX_API_KEY) headers['X-API-Key'] = process.env.FRAMEX_API_KEY;

  try {
    const upstream = await fetch(target.toString(), { headers, redirect: 'follow' });
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', path.includes('trending') || path.includes('popular') || path.includes('categories') || path.includes('genres') ? 's-maxage=180, stale-while-revalidate=300' : 'no-store');
    return res.status(upstream.status).send(Buffer.from(body));
  } catch (error) {
    return res.status(502).json({ error: 'Unable to reach the FRAMEX API', detail: error.message });
  }
}