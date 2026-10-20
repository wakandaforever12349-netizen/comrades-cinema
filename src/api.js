const proxy = '/api/framex';

export async function apiGet(path, params = {}) {
  const query = new URLSearchParams({ path });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const response = await fetch(`${proxy}?${query.toString()}`);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = data?.message || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export function listFrom(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['results', 'items', 'data', 'movies', 'series', 'content', 'titles']) {
    if (Array.isArray(data[key])) return data[key];
    if (data[key] && typeof data[key] === 'object') {
      for (const nested of ['results', 'items', 'movies', 'series', 'content']) {
        if (Array.isArray(data[key][nested])) return data[key][nested];
      }
    }
  }
  return [];
}

export function titleOf(item) {
  return item?.title || item?.name || item?.originalTitle || item?.original_title || item?.subjectName || 'Untitled';
}
export function slugOf(item) {
  return item?.slug || item?.urlSlug || item?.url_slug || item?.id || item?.subjectId || item?.subject_id || '';
}
export function imageOf(item) {
  return item?.posterUrl || item?.poster_url || item?.poster || item?.coverUrl || item?.cover_url ||
    item?.image || item?.thumbnail || item?.backdropUrl || item?.backdrop_url || '';
}
export function backdropOf(item) {
  return item?.backdropUrl || item?.backdrop_url || item?.backdrop || item?.coverUrl || item?.cover_url ||
    item?.posterUrl || item?.poster_url || item?.poster || imageOf(item);
}
export function descriptionOf(item) {
  return item?.overview || item?.description || item?.plot || item?.synopsis || item?.intro || 'No description is available for this title yet.';
}
export function yearOf(item) {
  const value = item?.releaseDate || item?.release_date || item?.year || item?.firstAirDate || item?.first_air_date;
  return value ? String(value).slice(0, 4) : '';
}
export function ratingOf(item) {
  const value = item?.rating ?? item?.voteAverage ?? item?.vote_average ?? item?.score;
  return value !== undefined && value !== null && value !== '' ? Number(value).toFixed(1) : '';
}
// FRAMEX responses may wrap the subject in `data`, `subject`, or `details`.
export function subjectIdOf(...values) {
  const seen = new WeakSet();
  function find(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return null;
    seen.add(value);
    for (const key of ['subjectId', 'subject_id', 'subjectID']) {
      const id = value[key];
      if ((typeof id === 'number' || typeof id === 'string') && String(id).trim()) return String(id).trim();
    }
    for (const key of ['subject', 'data', 'details', 'detail', 'movie', 'series', 'item', 'result', 'info']) {
      if (value[key]) {
        const id = find(value[key], depth + 1);
        if (id) return id;
      }
    }
    return null;
  }
  for (const value of values) {
    const id = find(value);
    if (id) return id;
  }
  return null;
}
