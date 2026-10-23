/* Loads published content (Daily Updates, Sermons & Teachings, Featured Events)
   for the public website. Uses the browser-safe anon key only — Row Level
   Security on the database ensures anonymous visitors can only ever read
   rows where published = true. If Supabase is unreachable or no content has
   been published yet, the static placeholder markup already in the page is
   left as-is, so the site never shows a broken or empty section. */
(function () {
  const CFG = window.MKC_SUPABASE_CONFIG || {};
  if (!window.supabase || !CFG.url || !CFG.anonKey) return;
  const client = window.supabase.createClient(CFG.url, CFG.anonKey);

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[m]));

  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function formatEventDate(dateStr) {
    if (!dateStr) return { day: '—', month: '' };
    const d = new Date(dateStr + 'T00:00:00');
    return { day: String(d.getDate()).padStart(2, '0'), month: MONTHS[d.getMonth()] };
  }
  function relativeDay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr), now = new Date();
    const days = Math.floor((now - d) / 86400000);
    if (days <= 0) return 'TODAY';
    if (days === 1) return 'YESTERDAY';
    if (days < 7) return `${days} DAYS AGO`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  }

  // ---- Media lightbox (inline player + "open original" link) ----
  function youTubeEmbedUrl(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : null;
  }
  function facebookEmbedUrl(url) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
  }
  function isOwnUpload(url) {
    // Files uploaded from the portal are stored in this project's own
    // Supabase Storage bucket, so they can be played directly with <video>/<audio>.
    return CFG.url && url.startsWith(CFG.url + '/storage/');
  }

  function openMediaLightbox({ title, mediaUrl, mediaType }) {
    const box = document.getElementById('mediaLightbox');
    const body = document.getElementById('mediaLightboxBody');
    const titleEl = document.getElementById('mediaLightboxTitle');
    const externalLink = document.getElementById('mediaLightboxExternal');
    if (!box || !body || !mediaUrl) return;

    titleEl.textContent = title || '';
    externalLink.href = mediaUrl;

    let inner = '';
    const yt = youTubeEmbedUrl(mediaUrl);
    if (yt) {
      inner = `<div class="embed-16-9"><iframe src="${esc(yt)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
    } else if (/facebook\.com|fb\.watch/i.test(mediaUrl)) {
      inner = `<div class="embed-16-9"><iframe src="${esc(facebookEmbedUrl(mediaUrl))}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
    } else if (isOwnUpload(mediaUrl) || mediaType === 'video') {
      inner = `<video src="${esc(mediaUrl)}" controls autoplay playsinline></video>`;
    } else if (mediaType === 'audio') {
      inner = `<audio src="${esc(mediaUrl)}" controls autoplay></audio>`;
    } else {
      // Unknown link type: no reliable inline embed, so skip straight to the external link.
      window.open(mediaUrl, '_blank', 'noopener');
      return;
    }
    body.innerHTML = inner;
    box.classList.remove('hidden');
    box.setAttribute('aria-hidden', 'false');
  }
  function closeMediaLightbox() {
    const box = document.getElementById('mediaLightbox');
    const body = document.getElementById('mediaLightboxBody');
    if (!box) return;
    box.classList.add('hidden');
    box.setAttribute('aria-hidden', 'true');
    if (body) body.innerHTML = ''; // stop any playing video/audio/iframe
  }
  document.getElementById('mediaLightboxClose')?.addEventListener('click', closeMediaLightbox);
  document.getElementById('mediaLightbox')?.addEventListener('click', (e) => { if (e.target.id === 'mediaLightbox') closeMediaLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMediaLightbox(); });

  async function loadUpdates() {
    const grid = document.getElementById('updateGrid');
    if (!grid) return;
    const { data, error } = await client.from('daily_updates').select('*')
      .eq('published', true).order('published_at', { ascending: false }).limit(6);
    if (error) return;
    if (!data || !data.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = data.map((u, i) => `
      <article class="update-card${i === 0 ? ' featured-update' : ''}">
        ${u.image_url ? `<img src="${esc(u.image_url)}" alt="" style="width:100%;border-radius:10px;margin-bottom:14px;max-height:170px;object-fit:cover">` : ''}
        <span class="update-date">${esc(relativeDay(u.published_at))}</span>
        <h3>${esc(u.title)}</h3>
        <p>${esc(u.body)}</p>
      </article>`).join('');
  }

  async function loadEvents() {
    const grid = document.getElementById('eventGridPublic');
    if (!grid) return;
    const { data, error } = await client.from('events').select('*')
      .eq('published', true).gte('event_date', new Date().toISOString().slice(0, 10))
      .order('event_date', { ascending: true }).limit(6);
    if (error) return;
    if (!data || !data.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = data.map((e) => {
      const { day, month } = formatEventDate(e.event_date);
      return `<article class="event-card">
        <div class="event-date"><strong>${day}</strong><span>${month}</span></div>
        <div>
          ${e.location ? `<span class="event-tag">${esc(e.location)}</span>` : ''}
          <h3>${esc(e.title)}</h3>
          <p>${esc(e.description || '')}</p>
        </div>
      </article>`;
    }).join('');
  }

  // ---- Featured-sermon background thumbnail (real video preview instead of a flat color block) ----
  function youTubeVideoId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
    return m ? m[1] : null;
  }
  function setFeatureThumbnail(el, { mediaUrl, mediaType }) {
    if (!el) return;
    el.innerHTML = '';
    el.parentElement?.classList.remove('has-media');
    if (!mediaUrl) return;
    const ytId = youTubeVideoId(mediaUrl);
    if (ytId) {
      // maxresdefault isn't always generated; hqdefault always exists.
      const img = document.createElement('img');
      img.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      img.alt = '';
      el.appendChild(img);
      el.parentElement?.classList.add('has-media');
    } else if (isOwnUpload(mediaUrl) && mediaType !== 'audio') {
      const video = document.createElement('video');
      video.src = mediaUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      // Force the browser to decode and paint the first frame as a still preview.
      video.addEventListener('loadeddata', () => { try { video.currentTime = 0.1; } catch (_) {} }, { once: true });
      el.appendChild(video);
      el.parentElement?.classList.add('has-media');
    }
    // Facebook links and unrecognized URLs: no reliable thumbnail source,
    // so leave the original solid background in place.
  }

  async function loadSermons() {
    const { data, error } = await client.from('sermons').select('*')
      .eq('published', true).order('sermon_date', { ascending: false }).limit(7);
    if (error) return;
    if (!data || !data.length) {
      const feature = document.getElementById('sermonFeature');
      const grid = document.getElementById('sermonGrid');
      if (feature) feature.classList.add('hidden');
      if (grid) grid.innerHTML = '';
      return;
    }
    const feature = document.getElementById('sermonFeature');
    if (feature) feature.classList.remove('hidden');
    const [latest, ...rest] = data;

    const media = document.getElementById('sermonFeatureMedia');
    const title = document.getElementById('sermonFeatureTitle');
    const ref = document.getElementById('sermonFeatureRef');
    if (feature && title && ref) {
      title.textContent = latest.title;
      ref.textContent = latest.scripture_reference || (latest.speaker || '');
      setFeatureThumbnail(media, { mediaUrl: latest.media_url, mediaType: latest.media_type });
      const play = () => openMediaLightbox({ title: latest.title, mediaUrl: latest.media_url, mediaType: latest.media_type });
      if (latest.media_url) {
        feature.addEventListener('click', play);
        feature.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
      }
    }

    const grid = document.getElementById('sermonGrid');
    if (grid) {
      grid.innerHTML = rest.map((s, i) => `
        <div class="sermon-card" data-sermon-index="${i}" role="button" tabindex="0">
          <span>${esc(s.scripture_reference || (s.media_type === 'audio' ? 'AUDIO' : 'VIDEO'))}</span>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.speaker || '')}${s.speaker && s.sermon_date ? ' • ' : ''}${esc(s.sermon_date || '')}</p>
        </div>`).join('');
      grid.querySelectorAll('.sermon-card').forEach((card) => {
        const s = rest[Number(card.dataset.sermonIndex)];
        if (!s || !s.media_url) return;
        const play = () => openMediaLightbox({ title: s.title, mediaUrl: s.media_url, mediaType: s.media_type });
        card.addEventListener('click', play);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
      });
    }
  }

  // ---- Contact info (address / phone / email) — shown on every page's footer
  // and the homepage contact section. Falls back to the static markup already
  // in the page if Supabase is unreachable or not yet configured. ----
  async function loadSiteSettings() {
    const targets = document.querySelectorAll('.js-address-line,.js-address-note,.js-phone-link,.js-email-link');
    if (!targets.length) return;
    const { data, error } = await client.from('site_settings').select('key,value');
    if (error || !data || !data.length) return;
    const settings = Object.fromEntries(data.map((r) => [r.key, r.value]));
    if (settings.address_line) document.querySelectorAll('.js-address-line').forEach((el) => { el.textContent = settings.address_line; });
    if (settings.address_note) document.querySelectorAll('.js-address-note').forEach((el) => { el.textContent = settings.address_note; });
    if (settings.phone) document.querySelectorAll('.js-phone-link').forEach((el) => { el.textContent = settings.phone; el.href = 'tel:' + settings.phone.replace(/\s+/g, ''); });
    if (settings.email) document.querySelectorAll('.js-email-link').forEach((el) => { el.textContent = settings.email; el.href = 'mailto:' + settings.email; });
  }

  // ---- Leadership team (leadership.html) ----
  function initialsOf(name) {
    return (name || '').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '—';
  }
  async function loadLeaders() {
    const grid = document.getElementById('leaderGrid');
    if (!grid) return;
    // Do not join departments here: departments are intentionally private to
    // authenticated portal users. The public site only needs the leader's
    // public fields, and a protected join can make the entire query fail.
    const { data, error } = await client.from('leaders').select('id,full_name,title,sort_order')
      .eq('active', true).order('sort_order', { ascending: true });
    if (error) { console.error('Public leadership load failed:', error); grid.innerHTML = '<div class="empty">Leadership information is temporarily unavailable.</div>'; return; }
    if (!data || !data.length) { grid.innerHTML = '<div class="empty">No leadership information has been published.</div>'; return; }
    grid.innerHTML = data.map((l) => `
      <article class="leader-card">
        <div class="leader-avatar">${esc(initialsOf(l.full_name))}</div>
        <h3>${esc(l.full_name)}</h3>
        <p>${esc(l.title)}</p>
      </article>`).join('');
  }

  // ---- Weekly service schedule (services.html) ----
  async function loadServiceSchedule() {
    const grid = document.getElementById('serviceGrid');
    if (!grid) return;
    const { data, error } = await client.from('service_schedule').select('*')
      .eq('active', true).order('sort_order', { ascending: true });
    if (error) { console.error('Public service schedule load failed:', error); grid.innerHTML = '<div class="empty">Weekly service information is temporarily unavailable.</div>'; return; }
    if (!data || !data.length) { grid.innerHTML = '<div class="empty">No weekly services have been published.</div>'; return; }
    const ICONS = { SUN: '✦', MON: '◆', TUE: '◆', WED: '🙏', THU: '📖', FRI: '◆', SAT: '◉' };
    grid.innerHTML = data.map((s) => `
      <article class="service-card${s.featured ? ' featured' : ''}">
        <div class="day">${esc(s.day_label)}</div>
        <div class="service-icon">${ICONS[String(s.day_label).toUpperCase()] || '◉'}</div>
        <h3>${esc(s.title)}</h3>
        <p class="time">${esc(s.time_label)}</p>
        <p>${esc(s.description || '')}</p>
      </article>`).join('');
  }

  loadUpdates();
  loadEvents();
  loadSermons();
  loadSiteSettings();
  loadLeaders();
  loadServiceSchedule();
})();
