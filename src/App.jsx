import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Play, Info, ChevronRight, X, Film, Clapperboard, Tv, LoaderCircle, AlertCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { apiGet, listFrom, titleOf, slugOf, imageOf, backdropOf, descriptionOf, yearOf, ratingOf, subjectIdOf } from './api';

const FALLBACK_POSTERS = [
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80'
];
const imageFor = (item, index = 0) => imageOf(item) || FALLBACK_POSTERS[index % FALLBACK_POSTERS.length];
const normaliseGenre = (g) => typeof g === 'string' ? g : g?.name || g?.title || g?.genreName || '';
// FRAMEX may nest a subject identifier inside data/subject/details objects.
// Avoid treating a movie's ordinary numeric id as a subjectId.
function findSubjectId(value, depth = 0, visited = new Set()) {
  if (typeof value === 'string') {
    // Some FRAMEX payloads expose the ID only inside source/proxy URLs.
    try {
      const parsed = new URL(value);
      const id = parsed.searchParams.get('subjectId') || parsed.searchParams.get('subject_id');
      if (id) return id;
    } catch {}
    return null;
  }
  if (!value || typeof value !== 'object' || depth > 8 || visited.has(value)) return null;
  visited.add(value);
  for (const key of ['subjectId', 'subject_id', 'subjectID']) {
    const id = value[key];
    if ((typeof id === 'number' || typeof id === 'string') && String(id).trim()) return String(id).trim();
  }
  // Search common wrappers first, then URL fields and other nested objects.
  for (const key of ['subject', 'data', 'detail', 'details', 'movie', 'series', 'item', 'result', 'info', 'source', 'streams']) {
    const found = findSubjectId(value[key], depth + 1, visited);
    if (found) return found;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (['proxyUrl', 'downloadUrl', 'url', 'playUrl', 'play_url'].includes(key) && typeof nested === 'string') {
      const found = findSubjectId(nested, depth + 1, visited);
      if (found) return found;
    }
    if (nested && typeof nested === 'object') {
      const found = findSubjectId(nested, depth + 1, visited);
      if (found) return found;
    }
  }
  return null;
}


function MovieCard({ item, index, onSelect }) {
  const [broken, setBroken] = useState(false);
  const title = titleOf(item);
  return <button className="movie-card" onClick={() => onSelect(item)} aria-label={`View ${title}`}>
    <div className="poster-wrap">
      <img src={broken ? FALLBACK_POSTERS[index % FALLBACK_POSTERS.length] : imageFor(item, index)} alt={`${title} poster`} loading="lazy" onError={() => setBroken(true)} />
      <div className="poster-overlay"><span className="round-play"><Play size={19} fill="currentColor" /></span><span>View details</span></div>
      {ratingOf(item) && <span className="rating">★ {ratingOf(item)}</span>}
    </div>
    <div className="card-title">{title}</div>
    <div className="card-meta">{yearOf(item) || 'Movie'}{item?.type ? ` · ${item.type}` : ''}</div>
  </button>;
}

function Section({ title, items, onSelect, loading, error, emptyText = 'No titles found.' }) {
  return <section className="section">
    <div className="section-heading"><h2>{title}</h2><span className="section-line" /></div>
    {loading ? <div className="loading-row"><LoaderCircle className="spin" /> Loading titles…</div> :
      error ? <div className="inline-error"><AlertCircle size={17} /> {error}</div> :
      items.length ? <div className="movie-grid">{items.map((item, i) => <MovieCard key={`${slugOf(item) || titleOf(item)}-${i}`} item={item} index={i} onSelect={onSelect} />)}</div> :
      <div className="empty-state">{emptyText}</div>}
  </section>;
}

export default function App() {
  const [trending, setTrending] = useState([]);
  const [popular, setPopular] = useState([]);
  const [series, setSeries] = useState([]);
  const [genres, setGenres] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [trailer, setTrailer] = useState('');
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [mobileSearch, setMobileSearch] = useState(false);

  const loadHome = useCallback(async () => {
    setLoading(true); setApiError('');
    const requests = await Promise.allSettled([
      apiGet('/api/v1/movies/trending', { page: 1 }),
      apiGet('/api/v1/movies/popular'),
      apiGet('/api/v1/series/popular'),
      apiGet('/api/v1/genres'),
      apiGet('/api/v1/categories')
    ]);
    const [t, p, s, g, c] = requests;
    if (t.status === 'fulfilled') setTrending(listFrom(t.value));
    if (p.status === 'fulfilled') setPopular(listFrom(p.value));
    if (s.status === 'fulfilled') setSeries(listFrom(s.value));
    if (g.status === 'fulfilled') setGenres(listFrom(g.value));
    if (c.status === 'fulfilled') setCategories(listFrom(c.value));
    if (requests.every(r => r.status === 'rejected')) setApiError('Could not load the FRAMEX API. Check your API key and Vercel environment variables.');
    setLoading(false);
  }, []);

  useEffect(() => { loadHome(); }, [loadHome]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setSearchResults([]); setSearchError(''); setSearching(false); return; }
    let active = true;
    setSearching(true); setSearchError('');
    const timer = setTimeout(async () => {
      try {
        const data = await apiGet('/api/v1/search', { q, page: 1 });
        if (active) setSearchResults(listFrom(data));
      } catch (e) {
        if (active) { setSearchResults([]); setSearchError(e.message || 'Search failed.'); }
      } finally { if (active) setSearching(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const openTitle = async (item) => {
    setSelected(item); setDetail(null); setDetailError(''); setTrailer(''); setStreamError('');
    setDetailLoading(true);
    const slug = slugOf(item);
    try {
      if (!slug) throw new Error('This title does not include a slug or ID.');
      const result = await apiGet(`/api/v1/movies/${encodeURIComponent(slug)}`);
      const actual = result?.data && !Array.isArray(result.data) ? result.data : result;
      // Preserve the original response for nested identifier lookup.
      setDetail({ ...actual, _rawResponse: result });
    } catch (e) { setDetailError(e.message || 'Could not load movie details.'); setDetail(item); }
    finally { setDetailLoading(false); }
  };

  const resolveSubjectId = async () => {
    const item = detail || selected;
    let id = findSubjectId(item) || findSubjectId(selected);
    if (!id) {
      const slug = slugOf(item);
      if (slug) {
        const response = await apiGet(`/api/v1/movies/${encodeURIComponent(slug)}`);
        id = findSubjectId(response);
        if (!id) {
          // Some detail responses wrap their useful fields in data/result; preserve
          // the response in the error so the missing field can be diagnosed.
          const keys = response && typeof response === 'object' ? Object.keys(response).join(', ') : typeof response;
          throw new Error(`FRAMEX movie detail response has no subjectId (top-level fields: ${keys || 'none'}). The streams JSON you shared is returned after subjectId is supplied; it cannot identify which movie was selected by itself.`);
        }
      }
    }
    if (!id) throw new Error('No movie slug or subjectId was found. Check the movie detail response from FRAMEX.');
    return id;
  };

  const getPlayLinks = async () => {
    const subjectId = await resolveSubjectId();
    const data = await apiGet('/api/play-links', { subjectId });
    return { subjectId, data };
  };

  const pickStream = (data) => {
    const streams = Array.isArray(data?.streams) ? data.streams :
      Array.isArray(data?.data?.streams) ? data.data.streams :
      Array.isArray(data) ? data :
      Array.isArray(data?.links) ? data.links :
      Array.isArray(data?.data) ? data.data :
      Array.isArray(data?.playLinks) ? data.playLinks : [];
    const maxResolution = Number(data?.playConfig?.maxResolution || data?.data?.playConfig?.maxResolution || 1080);
    const resolutionOf = (s) => Number(s?.resolutions || String(s?.quality || '').replace(/\D/g, '') || 0);
    const ordered = [...streams].sort((a, b) => resolutionOf(b) - resolutionOf(a));
    return ordered.find(s => resolutionOf(s) <= maxResolution) || ordered[0] || null;
  };

  const playTrailer = async () => {
    setStreamLoading(true); setStreamError(''); setTrailer('');
    try {
      const { data } = await getPlayLinks();
      const stream = pickStream(data);
      const url = stream?.proxyUrl || stream?.url || stream?.link || stream?.playUrl || stream?.play_url;
      if (url) setTrailer(url);
      else if (data?.hasResource === false) setStreamError('FRAMEX reports no stream is available for this title.');
      else setStreamError('FRAMEX returned no playable stream URL. Check the play-links response format.');
    } catch (e) {
      setStreamError(e.message || 'Could not get playback links.');
    } finally { setStreamLoading(false); }
  };

  const downloadMovie = async () => {
    setStreamLoading(true); setStreamError('');
    try {
      const { subjectId, data } = await getPlayLinks();
      let stream = pickStream(data);
      let url = stream?.downloadUrl;
      if (!url) {
        const downloads = await apiGet('/api/download-links', { subjectId });
        stream = pickStream(downloads);
        url = stream?.downloadUrl || stream?.proxyUrl || stream?.url;
      }
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else setStreamError('FRAMEX did not return a download URL for this title.');
    } catch (e) {
      setStreamError(e.message || 'Could not get download options.');
    } finally { setStreamLoading(false); }
  };

  const visibleTrending = useMemo(() => selectedGenre ? trending.filter(m => (m.genres || m.genre || []).map(normaliseGenre).some(g => g.toLowerCase() === selectedGenre.toLowerCase())) : trending, [trending, selectedGenre]);
  const isSearching = query.trim().length > 0;
  const hero = trending[0] || popular[0] || null;
  const closeDetail = () => { setSelected(null); setDetail(null); setTrailer(''); setStreamError(''); };

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => { closeDetail(); setQuery(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="Comrades Cinema home">
        <span className="brand-icon"><Clapperboard size={22} /></span>
        <span className="brand-name">COMRADES <b>CINEMA</b><small>POWERED BY COMRADES CYBER</small></span>
      </button>
      <nav className="desktop-nav"><button onClick={() => { setQuery(''); setSelectedGenre(''); }}>Home</button><button onClick={() => document.getElementById('movies')?.scrollIntoView({ behavior: 'smooth' })}>Movies</button><button onClick={() => document.getElementById('series')?.scrollIntoView({ behavior: 'smooth' })}>Series</button></nav>
      <div className={`search-box ${mobileSearch ? 'mobile-open' : ''}`}><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search movies and series…" aria-label="Search movies and series" /><button className="mobile-search-close" onClick={() => setMobileSearch(false)} aria-label="Close search"><X size={17}/></button></div>
      <button className="mobile-search-toggle" onClick={() => setMobileSearch(v => !v)} aria-label="Open search"><Search size={21}/></button>
    </header>

    {selected ? <main className="detail-page">
      <button className="back-button" onClick={closeDetail}><ArrowLeft size={17}/> Back to browsing</button>
      {detailLoading ? <div className="detail-loading"><LoaderCircle className="spin" size={30}/> Loading title details…</div> :
        <div className="detail-layout">
          <div className="detail-poster"><img src={imageFor(detail || selected)} alt={`${titleOf(detail || selected)} poster`} /></div>
          <div className="detail-copy">
            <span className="eyebrow">COMRADES CINEMA ORIGINAL DISCOVERY</span>
            <h1>{titleOf(detail || selected)}</h1>
            <div className="detail-meta">{yearOf(detail || selected) && <span>{yearOf(detail || selected)}</span>}{ratingOf(detail || selected) && <span>★ {ratingOf(detail || selected)}</span>}{(detail || selected)?.duration && <span>{(detail || selected).duration}</span>}</div>
            <p>{descriptionOf(detail || selected)}</p>
            {detailError && <p className="muted-note">{detailError}</p>}
            <div className="detail-actions"><button className="primary-button" onClick={playTrailer} disabled={streamLoading}><Play size={18} fill="currentColor"/>{streamLoading ? 'Finding link…' : 'Play movie'}</button><button className="secondary-button" onClick={downloadMovie} disabled={streamLoading}><ExternalLink size={17}/> Download options</button></div>
            {streamError && <div className="inline-error"><AlertCircle size={16}/>{streamError}</div>}
            {trailer && <div className="player-box"><div className="player-heading">Available stream</div><a href={trailer} target="_blank" rel="noreferrer"><Play size={16}/> Open stream <ExternalLink size={14}/></a><p>Playback links depend on the stream format returned by FRAMEX. If this is an HLS or direct video URL, your browser may support it in a compatible player.</p></div>}
            {Array.isArray((detail || selected)?.genres) && <div className="detail-genres">{(detail || selected).genres.map((g, i) => <span key={i}>{normaliseGenre(g)}</span>)}</div>}
          </div>
        </div>}
    </main> : <>
      <main>
        {isSearching ? <section className="search-results-page">
          <div className="section-heading"><h1>Search results</h1><span className="section-line"/></div>
          <p className="subheading">Showing results for “{query.trim()}”</p>
          {searching ? <div className="loading-row"><LoaderCircle className="spin"/> Searching FRAMEX…</div> : searchError ? <div className="inline-error"><AlertCircle size={17}/>{searchError}</div> : searchResults.length ? <div className="movie-grid">{searchResults.map((m,i) => <MovieCard key={`${slugOf(m)}-${i}`} item={m} index={i} onSelect={openTitle}/>)}</div> : <div className="empty-state">No results found. Try another title.</div>}
        </section> : <>
          {hero && <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(7,10,9,.98) 0%, rgba(7,10,9,.82) 42%, rgba(7,10,9,.18) 100%), linear-gradient(0deg, #080b0a 0%, transparent 45%), url("${backdropOf(hero)}")` }}>
            <div className="hero-content"><span className="eyebrow"><span className="live-dot"/> TRENDING ON COMRADES CINEMA</span><h1>{titleOf(hero)}</h1><div className="hero-meta">{yearOf(hero) && <span>{yearOf(hero)}</span>}{ratingOf(hero) && <span>★ {ratingOf(hero)}</span>}<span>Featured title</span></div><p>{descriptionOf(hero)}</p><div className="hero-buttons"><button className="primary-button" onClick={() => openTitle(hero)}><Play size={18} fill="currentColor"/> Explore title</button><button className="secondary-button" onClick={() => openTitle(hero)}><Info size={18}/> More info</button></div></div>
            <div className="hero-badge"><Film size={15}/> YOUR WORLD OF ENTERTAINMENT</div>
          </section>}
          {!hero && !loading && <section className="hero hero-empty"><div className="hero-content"><span className="eyebrow">POWERED BY COMRADES CYBER</span><h1>Your next favorite film awaits.</h1><p>Discover movies and series from the FRAMEX catalogue.</p><button className="primary-button" onClick={loadHome}><ChevronRight size={18}/> Try again</button></div></section>}
          {apiError && <div className="global-error"><AlertCircle size={18}/><div><b>Could not connect to FRAMEX</b><p>{apiError} Set <code>FRAMEX_API_KEY</code> in Vercel → Project Settings → Environment Variables, then redeploy.</p><button onClick={loadHome}>Retry</button></div></div>}
          <div className="content-area">
            {genres.length > 0 && <div className="genre-strip"><button className={!selectedGenre ? 'genre-chip active' : 'genre-chip'} onClick={() => setSelectedGenre('')}>All genres</button>{genres.slice(0, 12).map((g,i) => { const name = normaliseGenre(g); return name ? <button key={`${name}-${i}`} className={selectedGenre === name ? 'genre-chip active' : 'genre-chip'} onClick={() => setSelectedGenre(name)}>{name}</button> : null; })}</div>}
            <div id="movies"><Section title={selectedGenre ? `${selectedGenre} Movies` : 'Trending Movies'} items={visibleTrending} onSelect={openTitle} loading={loading} error="" emptyText={selectedGenre ? 'No trending titles matched this genre.' : 'No trending movies are available right now.'}/></div>
            {!selectedGenre && <Section title="Popular Movies" items={popular} onSelect={openTitle} loading={loading} error=""/>}
            {!selectedGenre && <div id="series"><Section title="Popular Series" items={series} onSelect={openTitle} loading={loading} error=""/></div>}
            {!selectedGenre && categories.length > 0 && <section className="section"><div className="section-heading"><h2>Explore Categories</h2><span className="section-line"/></div><div className="category-grid">{categories.slice(0, 8).map((c,i) => { const name = normaliseGenre(c) || c?.categoryName || c?.label || `Category ${i+1}`; return <button className="category-tile" key={`${name}-${i}`} onClick={() => { setSelectedGenre(name); document.getElementById('movies')?.scrollIntoView({behavior:'smooth'}); }}><span>{name}</span><ChevronRight size={18}/></button>; })}</div></section>}
          </div>
        </>}
      </main>
    </>}
    <footer className="footer"><div className="footer-brand">COMRADES <b>CINEMA</b></div><p>Your World of Entertainment.</p><span>Powered by Comrades Cyber · Movie metadata and playback availability provided by FRAMEX.</span></footer>
  </div>;
}