/* ─────────────────────────────────────────────────────────────
   Durham Civic Hub - app.js
   Handles: news, meetings, calendar, site-wide search
   ───────────────────────────────────────────────────────────── */

'use strict';

// ── State ─────────────────────────────────────────────────────
let allStories   = [];
let activeTag    = null;
let searchQuery  = '';
let newsData     = null;
let meetingsData = null;

// ── Utility ───────────────────────────────────────────────────
function relDay(isoDate) {
  const d    = new Date(isoDate + 'T00:00:00');
  const now  = new Date();
  now.setHours(0,0,0,0);
  const diff = Math.round((d - now) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 7)  return `In ${diff} days`;
  if (diff < 0 && diff >= -7) return `${Math.abs(diff)} days ago`;
  return '';
}

function fmt(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US',
    { month:'short', day:'numeric', year:'numeric' });
}

function fmtLong(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US',
    { weekday:'short', month:'short', day:'numeric' });
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ── Mobile nav toggle ─────────────────────────────────────────
function toggleNav() {
  document.getElementById('mainNav')?.classList.toggle('open');
}

// ── Nav dropdowns ─────────────────────────────────────────────
function buildNavDropdowns() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;

  const NAV_CONFIG = {
    'meetings.html': [
      { label: 'Meetings & Calendar',      url: 'meetings.html',                  header: true },
      { label: 'Board of Commissioners',   url: 'meetings.html#commissioners'   },
      { label: 'Durham City Council',      url: 'meetings.html#city-council'    },
      { label: 'DPS Board of Education',   url: 'meetings.html#dps'             },
      { label: 'Advisory Boards & Commissions', url: 'meetings.html#advisory'    },
    ],
    'budget.html': [
      { label: 'Budget Hub',               url: 'budget.html',                    header: true },
      { label: 'Budget Explorer',          url: 'budget-explorer.html'          },
      { divider: true },
      { label: 'Durham County Budget',     url: 'budget-county.html'            },
      { label: 'City of Durham Budget',    url: 'budget-city.html'              },
      { label: 'DPS Budget',               url: 'budget-schools.html'           },
      { label: 'Capital Projects (CIP)',   url: 'cip.html'                      },
    ],
    'my-durham.html': [
      { label: 'My Durham',                url: 'my-durham.html',                  header: true },
      { label: 'Neighborhood Lookup',      url: 'my-durham.html'                },
      { divider: true },
      { label: 'Resources & Services',     url: 'resources.html'                },
      { label: 'Voting & Officials',       url: 'voting.html'                   },
      { label: 'Transit',                  url: 'transit.html'                  },
    ],
  };

  nav.querySelectorAll('.nav-link').forEach(link => {
    const href  = link.getAttribute('href');
    const items = NAV_CONFIG[href];
    if (!items) return;

    // Wrap in nav-item
    const wrapper = document.createElement('div');
    wrapper.className = 'nav-item';
    link.parentNode.insertBefore(wrapper, link);
    wrapper.appendChild(link);

    // Chevron indicator
    const chevron    = document.createElement('span');
    chevron.className = 'nav-chevron';
    chevron.textContent = '▾';
    link.appendChild(chevron);

    // Build dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'nav-dropdown';
    dropdown.innerHTML = items.map(item => {
      if (item.divider) return '<div class="nav-dropdown-divider"></div>';
      const cls = item.header ? 'nav-dropdown-link nav-dropdown-link--header' : 'nav-dropdown-link';
      const ext = item.external ? ' target="_blank" rel="noopener"' : '';
      return `<a class="${cls}" href="${item.url}"${ext}>${item.label}</a>`;
    }).join('');
    wrapper.appendChild(dropdown);

    // Mobile: first click opens dropdown; second click navigates
    link.addEventListener('click', function(e) {
      if (window.innerWidth >= 640) return; // desktop uses CSS :hover
      if (!wrapper.classList.contains('open')) {
        e.preventDefault();
        nav.querySelectorAll('.nav-item.open').forEach(w => {
          if (w !== wrapper) w.classList.remove('open');
        });
        wrapper.classList.add('open');
      }
    });
  });

  // Mark parent dropdown as active when on a sub-page
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const SUB_PAGE_PARENTS = {
    'resources.html': 'my-durham.html',
    'voting.html':    'my-durham.html',
    'transit.html':   'my-durham.html',
  };
  if (SUB_PAGE_PARENTS[page]) {
    const parentLink = nav.querySelector(`a[href="${SUB_PAGE_PARENTS[page]}"]`);
    if (parentLink) parentLink.classList.add('active');
  }

  // Close dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    if (!nav.contains(e.target)) {
      nav.querySelectorAll('.nav-item.open').forEach(w => w.classList.remove('open'));
    }
  });
}

// ── Search overlay ────────────────────────────────────────────
function openSearch() {
  document.getElementById('searchOverlay').classList.add('open');
  document.getElementById('siteSearchInput').focus();
}
function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('open');
  document.getElementById('siteSearchInput').value = '';
  document.getElementById('siteSearchResults').innerHTML = '';
}

function runSiteSearch(q) {
  const results = document.getElementById('siteSearchResults');
  q = q.trim().toLowerCase();
  if (q.length < 2) { results.innerHTML = ''; return; }

  const hits = [];

  // Search pages (static)
  const pages = [
    { title: 'Home',                 url: 'index.html',           desc: 'Durham Civic Hub home page - navigator and what\'s happening now.' },
    { title: 'News & Updates',       url: 'news.html',            desc: 'Local government news from Durham County, the City, and DPS.' },
    { title: 'Meetings & Calendar',  url: 'meetings.html',        desc: 'BOCC, City Council, DPS Board, Planning Commission, agendas, and civic calendar.' },
    { title: 'Budgets',              url: 'budget.html',          desc: 'Durham County, City of Durham, and Durham Public Schools budgets.' },
    { title: 'Budget Explorer',      url: 'budget-explorer.html', desc: 'Interactive budget explorer - spending by area, funding sources, department breakdowns.' },
    { title: 'Durham County Budget', url: 'budget-county.html',   desc: 'County budget documents, dashboard, and FY2026-27 process.' },
    { title: 'City of Durham Budget','url': 'budget-city.html',   desc: 'City budget documents, Finance Department, and City Council.' },
    { title: 'DPS Budget',           url: 'budget-schools.html',  desc: 'Durham Public Schools budget, funding sources, and documents.' },
    { title: 'Voting & Elected Officials', url: 'voting.html',    desc: 'Register to vote, find your polling place, and learn about your representatives.' },
    { title: 'Connect',              url: 'connect.html',         desc: 'Contact and follow Commissioner Nida Allam - social media, events, town halls.' },
  ];
  pages.forEach(p => {
    if (p.title.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) {
      hits.push({ type: 'page', title: p.title, url: p.url, desc: p.desc });
    }
  });

  // Search news stories (if loaded)
  if (newsData?.stories) {
    newsData.stories.forEach(s => {
      const haystack = (s.title + ' ' + s.excerpt + ' ' + (s.tags||[]).join(' ')).toLowerCase();
      if (haystack.includes(q)) {
        hits.push({ type: 'news', title: s.title, url: s.link, desc: s.excerpt?.slice(0,120) + '…', date: s.date });
      }
    });
  }

  // Search meetings (if loaded)
  if (meetingsData?.bodies) {
    meetingsData.bodies.forEach(body => {
      if (body.name.toLowerCase().includes(q) || body.description?.toLowerCase().includes(q)) {
        hits.push({ type: 'meeting', title: body.name, url: 'meetings.html#' + body.id, desc: body.schedule });
      }
    });
  }

  if (!hits.length) {
    results.innerHTML = '<div class="search-no-results">No results found for "<strong>' + esc(q) + '</strong>"</div>';
    return;
  }

  results.innerHTML = hits.slice(0,12).map(h => `
    <a class="search-result-item" href="${esc(h.url)}" ${h.url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>
      <span class="search-result-type">${esc(h.type)}</span>
      <span class="search-result-title">${esc(h.title)}</span>
      ${h.date ? `<span class="search-result-date">${esc(h.date)}</span>` : ''}
      ${h.desc ? `<span class="search-result-desc">${esc(h.desc)}</span>` : ''}
    </a>
  `).join('');
}

function injectSearchUI() {
  // Add search button to nav
  const nav = document.getElementById('mainNav');
  if (nav) {
    const btn = document.createElement('button');
    btn.className   = 'nav-search-btn';
    btn.setAttribute('aria-label', 'Search site');
    btn.innerHTML   = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    btn.onclick     = openSearch;
    nav.appendChild(btn);
  }

  // Inject overlay into body
  const overlay = document.createElement('div');
  overlay.id        = 'searchOverlay';
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-modal">
      <div class="search-modal-header">
        <input id="siteSearchInput" class="search-modal-input"
               type="search" placeholder="Search news, meetings, budget, voting…"
               autocomplete="off" />
        <button class="search-modal-close" onclick="closeSearch()" aria-label="Close search"><i data-lucide="x" aria-hidden="true" class="lucide-wrap"></i></button>
      </div>
      <div id="siteSearchResults" class="search-modal-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearch();
  });

  // Live search
  document.getElementById('siteSearchInput').addEventListener('input', e => {
    runSiteSearch(e.target.value);
  });
}


// ── Entity badge helper ───────────────────────────────────────
function entityBadge(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('durham county') || s.includes('dconc') || s.includes('commissioner'))
    return '<span class="entity-badge entity-badge--county">Durham County</span>';
  if (s.includes('city of durham') || s.includes('durhamnc') || s.includes('city council'))
    return '<span class="entity-badge entity-badge--city">City of Durham</span>';
  if (s.includes('durham public schools') || s.includes('dps') || s.includes('dpsnc'))
    return '<span class="entity-badge entity-badge--dps">Durham Public Schools</span>';
  if (s.includes('wral') || s.includes('indy week') || s.includes('abc11') || s.includes('newsline') || s.includes('observer') || s.includes('herald'))
    return '<span class="entity-badge entity-badge--press">Press</span>';
  return '';
}

// ── News ──────────────────────────────────────────────────────
let sortNewestFirst = true;

async function loadNews() {
  const upd  = document.getElementById('newsUpdated');
  try {
    const res = await fetch('data/news.json');
    newsData  = await res.json();
    allStories = newsData.stories || [];
    if (upd && newsData.updated) {
      upd.textContent = `Updated ${fmt(newsData.updated)} · Local government news from Durham County sources`;
    }
    buildTagFilters();
    renderStories();
  } catch {
    // fallback HTML already in place
  }
}

function buildTagFilters() {
  const bar = document.getElementById('tagFilters');
  if (!bar) return;
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter news by topic');
  const tags = [...new Set(allStories.flatMap(s => s.tags || [s.tag]).filter(Boolean))].sort();
  bar.innerHTML = `<button class="tag-btn active" aria-pressed="true" onclick="filterByTag(null,this)">All</button>` +
    tags.map(t => `<button class="tag-btn" aria-pressed="false" onclick="filterByTag('${esc(t)}',this)">${esc(t)}</button>`).join('');
}

function filterByTag(tag, btn) {
  activeTag = tag;
  document.querySelectorAll('#tagFilters .tag-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');
  renderStories();
}

function toggleSort() {
  sortNewestFirst = !sortNewestFirst;
  const lbl = document.getElementById('sortLabel');
  if (lbl) lbl.textContent = sortNewestFirst ? 'Newest first' : 'Oldest first';
  renderStories();
}

function filterStories() {
  const filtered = allStories.filter(s => {
    const tagOk   = !activeTag || (s.tags||[s.tag]).filter(Boolean).includes(activeTag);
    const queryOk = !searchQuery ||
      (s.title + ' ' + (s.excerpt||'')).toLowerCase().includes(searchQuery.toLowerCase());
    return tagOk && queryOk;
  });
  return sortNewestFirst ? filtered : [...filtered].reverse();
}

function renderStories() {
  const grid = document.getElementById('storiesGrid');
  if (!grid) return;
  const stories = filterStories();
  if (!stories.length) {
    grid.innerHTML = '<p style="color:var(--muted);padding:2rem 0;">No stories match your filter.</p>';
    return;
  }
  grid.innerHTML = stories.map((s, i) => {
    const tag = (s.tags||[s.tag]).filter(Boolean).slice(0,1)
                  .map(t => `<span class="story-tag">${esc(t)}</span>`).join('');
    const img = s.image
      ? `<a href="${esc(s.link)}" target="_blank" rel="noopener" class="story-img-link">
           <img class="story-img" src="${esc(s.image)}" alt="" loading="lazy" />
         </a>`
      : '';
    const meaning = s.meaning
      ? `<p class="story-meaning"><i data-lucide="lightbulb" aria-hidden="true" class="lucide-wrap"></i> ${esc(s.meaning)}</p>`
      : '';
    return `
    <article class="story-card${i === 0 ? ' story-card--lead' : ''}${s.image ? ' story-card--has-img' : ''}">
      ${img}
      <div class="story-body">
        <div class="story-meta">
          ${tag}
          ${entityBadge(s.source)}
          <span class="story-source">${esc(s.source)}</span>
          <span class="story-date">${esc(s.displayDate || s.date)}</span>
        </div>
        <h3 class="story-title">
          <a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.title)}</a>
        </h3>
        ${s.excerpt ? `<p class="story-excerpt">${esc(s.excerpt)}</p>` : ''}
        ${meaning}
        <a class="story-read-more" href="${esc(s.link)}" target="_blank" rel="noopener">Read more →</a>
      </div>
    </article>
  `;
  }).join('');
  if (window._lcIcons) window._lcIcons(grid);
}

// ── Meetings ──────────────────────────────────────────────────
async function loadMeetings() {
  const container = document.getElementById('meetingsContainer');
  if (!container) return;
  try {
    const res    = await fetch('data/meetings.json');
    meetingsData = await res.json();
    renderMeetings(meetingsData, container);
  } catch {
    // fallback HTML already in place
  }
}


function entityBadgeForBody(body) {
  const id   = body.id || '';
  const name = (body.name || '').toLowerCase();
  // Elected boards
  if (id === 'commissioners')  return '<span class="entity-badge entity-badge--county">Durham County</span>';
  if (id === 'city-council')   return '<span class="entity-badge entity-badge--city">City of Durham</span>';
  if (id === 'dps')            return '<span class="entity-badge entity-badge--dps">Durham Public Schools</span>';
  // City boards
  const cityIds = ['board-of-adjustment','planning','bicycle-pedestrian','workers-rights',
    'civilian-police-review','racial-equity','environmental-affairs','historic-preservation',
    'cultural-advisory','open-space-trails','jccpc','workforce-development','human-relations',
    'housing-appeals','recreation-advisory','citizens-advisory','housing-authority'];
  if (cityIds.includes(id)) return '<span class="entity-badge entity-badge--city">City of Durham</span>';
  // Joint city-county
  const jointIds = ['homeless-services','cultural-advisory','environmental-affairs',
    'historic-preservation','jccpc','bicycle-pedestrian','open-space-trails'];
  if (jointIds.includes(id)) return '<span class="entity-badge entity-badge--joint">City &amp; County</span>';
  // County boards
  return '<span class="entity-badge entity-badge--county">Durham County</span>';
}

function renderBodyCard(body) {
  // Show all upcoming/cancelled meetings, but only the single most recent past meeting.
  // Unverified past meetings (no links) are hidden entirely.
  const all = body.meetings || [];
  const upcoming = all
    .filter(m => m.status === 'upcoming' || m.status === 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = all
    .filter(m => m.status === 'past' && (m.links || []).length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const mostRecentPast = past.length > 0 ? [past[0]] : [];
  const displayMeetings = [...upcoming, ...mostRecentPast];
  const total = displayMeetings.length;

  let contentHtml;
  if (total === 0) {
    contentHtml = '<p style="font-size:.85rem;color:var(--muted);padding:.5rem 0;">No upcoming meetings scheduled yet. Check back soon.</p>';
  } else {
    const carouselItems = displayMeetings
      .map((m, i) => `<div class="meeting-carousel-item${i === 0 ? ' active' : ''}" data-idx="${i}">${renderMeetingRow(m)}</div>`)
      .join('');
    const navHtml = total > 1 ? `
      <div class="meeting-carousel-nav">
        <button class="carousel-btn carousel-btn--prev"
                onclick="meetingCarouselNav('${esc(body.id)}',-1)"
                disabled aria-label="Previous meeting">‹</button>
        <span class="carousel-counter"><strong>1</strong> of ${total}</span>
        <button class="carousel-btn carousel-btn--next"
                onclick="meetingCarouselNav('${esc(body.id)}',1)"
                aria-label="Next meeting">›</button>
      </div>` : '';
    contentHtml = `<div class="meeting-carousel">${carouselItems}</div>${navHtml}`;
  }

  return `
    <section class="meetings-section" id="${esc(body.id)}">
      <div class="meeting-body-header">
        <div>
          <div class="meeting-body-name">${esc(body.name)}</div>
          <div class="meeting-body-entity">${entityBadgeForBody(body)}</div>
          <div class="meeting-body-desc">${esc(body.description || '')}</div>
        </div>
      </div>
      <div class="meeting-body-meta">
        <span><i data-lucide="calendar" aria-hidden="true" class="lucide-wrap"></i> ${esc(body.schedule)}</span>
        <span><i data-lucide="map-pin" aria-hidden="true" class="lucide-wrap"></i> ${esc(body.location)}</span>
      </div>
      ${contentHtml}
      <a class="archive-link" href="${esc(body.archiveUrl)}" target="_blank" rel="noopener">Agendas & Minutes →</a>
    </section>
  `;
}

function meetingCarouselNav(bodyId, dir) {
  const section = document.getElementById(bodyId);
  if (!section) return;
  const items = Array.from(section.querySelectorAll('.meeting-carousel-item'));
  if (!items.length) return;
  const curr = items.findIndex(i => i.classList.contains('active'));
  const next = Math.max(0, Math.min(items.length - 1, curr + dir));
  items.forEach((item, i) => item.classList.toggle('active', i === next));
  const counter = section.querySelector('.carousel-counter');
  if (counter) counter.innerHTML = `<strong>${next + 1}</strong> of ${items.length}`;
  const prevBtn = section.querySelector('.carousel-btn--prev');
  const nextBtn = section.querySelector('.carousel-btn--next');
  if (prevBtn) prevBtn.disabled = next === 0;
  if (nextBtn) nextBtn.disabled = next === items.length - 1;
}

function renderMeetings(data, container) {
  const elected  = data.bodies.filter(b => b.group === 'elected');
  const advisory = data.bodies.filter(b => b.group === 'advisory' || !b.group);

  // Build sticky jump bar
  const jumpBar = document.getElementById('jumpBar');
  if (jumpBar) {
    const allBodies = [...elected, ...advisory];
    jumpBar.innerHTML =
      `<span class="jump-label">Jump to:</span>` +
      allBodies.map(b =>
        `<a href="#${esc(b.id)}" class="jump-link">${esc(b.name)}</a>`
      ).join('');
  }

  container.innerHTML = `
    <div class="meetings-group">
      <h2 class="meetings-group-title">Elected Boards</h2>
      ${elected.map(renderBodyCard).join('')}
    </div>
    <div class="meetings-group" id="advisory">
      <h2 class="meetings-group-title">Advisory Boards &amp; Commissions</h2>
      <div style="background:#e0f3f6;border-left:4px solid #207C91;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 2rem;">
        <div>
          <p style="font-size:.95rem;font-weight:700;color:#262E4F;margin:0 0 .2rem;">Want to serve on a board or commission?</p>
          <p style="font-size:.875rem;color:#374151;margin:0;">Durham neighbors can apply to serve on advisory boards, commissions, and task forces. Your voice matters in shaping local policy!</p>
        </div>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;flex-shrink:0;">
          <a href="https://www.dconc.gov/clerk-to-the-board/boards-and-commissions" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:.35rem;background:#262E4F;color:#fff;font-size:.875rem;font-weight:700;padding:.5rem 1rem;border-radius:6px;text-decoration:none;">Apply - Durham County →</a>
          <a href="https://www.durhamnc.gov/238/Boards-Committees-Commissions-Task-Force" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:.35rem;background:#207C91;color:#fff;font-size:.875rem;font-weight:700;padding:.5rem 1rem;border-radius:6px;text-decoration:none;">Apply - City of Durham →</a>
        </div>
      </div>
      ${advisory.map(renderBodyCard).join('')}
    </div>
  `;

  if (window._twParse) window._twParse(container);

  // Hash-based scroll: handle #commissioners, #city-council, #dps, #advisory, etc.
  const hash = window.location.hash;
  if (hash) {
    setTimeout(() => {
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }
}

function renderMeetingRow(m) {
  const rel   = relDay(m.date);
  const time  = m.official_time || m.time || '';
  const label = m.status === 'upcoming' ? 'meeting-status--upcoming'
              : m.status === 'cancelled' ? 'meeting-status--cancelled'
              : 'meeting-status--past';
  const links = (m.links || []).map(l =>
    `<a class="meeting-link${l.primary ? ' meeting-link--primary' : ''}"
        href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
  ).join('');
  return `
    <div class="meeting-row">
      <div class="meeting-date-display">
        ${rel ? `<span class="meeting-rel-day">${esc(rel)}</span>` : ''}
        <span class="meeting-row-date">${esc(fmt(m.date))}</span>
        ${time ? `<span class="meeting-row-time">${esc(time)}</span>` : ''}
      </div>
      <div class="meeting-row-info">
        <div class="meeting-type">${esc(m.type)}</div>
        <span class="meeting-status ${label}">${esc(m.status)}</span>
      </div>
      <div class="meeting-row-links">${links}</div>
    </div>
  `;
}

// ── Calendar ──────────────────────────────────────────────────
let calendarData   = null;
let calView        = 'grid';  // 'grid' | 'list'
let calGridYear    = null;
let calGridMonth   = null;    // 0-indexed
let calActiveFilter = null;

const CAL_COLOR_MAP = {
  government:  '#207C91',
  budget:      '#E97221',
  hearing:     '#DA421E',
  schools:     '#3B82F6',
  community:   '#6E9D97',
  health:      '#D97706',
  announcement:'#EBA85C',
};

function calColor(category) {
  return CAL_COLOR_MAP[(category || '').toLowerCase()] || '#207C91';
}

async function loadCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;
  try {
    const res  = await fetch('data/calendar.json');
    calendarData = await res.json();
    // Default to current month
    const now = new Date();
    calGridYear  = now.getFullYear();
    calGridMonth = now.getMonth();
    setCalView('grid');
  } catch {
    container.innerHTML = '<p style="color:var(--muted)">Could not load calendar data.</p>';
  }
}

function setCalView(mode) {
  calView = mode;
  document.getElementById('calViewGrid')?.classList.toggle('active', mode === 'grid');
  document.getElementById('calViewList')?.classList.toggle('active', mode === 'list');
  document.getElementById('calMonthNav').style.display = mode === 'grid' ? 'flex' : 'none';
  document.getElementById('calDayDetail').style.display = 'none';
  renderCalendar(calendarData, document.getElementById('calendarContainer'));
}

function calFilterCat(cat, btn) {
  calActiveFilter = cat;
  document.querySelectorAll('#calCatFilters .tag-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  closeDayDetail();
  renderCalendar(calendarData, document.getElementById('calendarContainer'));
}

function closeDayDetail() {
  document.getElementById('calDayDetail').style.display = 'none';
  document.querySelectorAll('.cal-grid-cell--selected').forEach(c => c.classList.remove('cal-grid-cell--selected'));
}

function renderCalendar(data, container) {
  if (!data || !data.events || !data.events.length) {
    container.innerHTML = '<p style="color:var(--muted)">No upcoming events.</p>';
    return;
  }
  if (calView === 'grid') {
    renderCalendarGrid(data, container);
  } else {
    renderCalendarList(data, container);
  }
}

// ── Grid view ─────────────────────────────────────────────────
function renderCalendarGrid(data, container) {
  const events = data.events;
  const year   = calGridYear;
  const month  = calGridMonth;

  // Update month label + wire nav buttons
  const label = new Date(year, month, 1).toLocaleDateString('en-US', {month:'long', year:'numeric'});
  const el = document.getElementById('calMonthLabel');
  if (el) el.textContent = label;

  document.getElementById('calPrevBtn').onclick = () => {
    calGridMonth--;
    if (calGridMonth < 0) { calGridMonth = 11; calGridYear--; }
    renderCalendarGrid(data, container);
    closeDayDetail();
  };
  document.getElementById('calNextBtn').onclick = () => {
    calGridMonth++;
    if (calGridMonth > 11) { calGridMonth = 0; calGridYear++; }
    renderCalendarGrid(data, container);
    closeDayDetail();
  };
  document.getElementById('calTodayBtn').onclick = () => {
    const now = new Date();
    calGridYear  = now.getFullYear();
    calGridMonth = now.getMonth();
    renderCalendarGrid(data, container);
    closeDayDetail();
  };

  // Filter events by active category, then index by date
  const filteredEvents = calActiveFilter
    ? events.filter(ev => (ev.category || '').toLowerCase() === calActiveFilter)
    : events;
  const byDate = {};
  filteredEvents.forEach(ev => {
    (byDate[ev.date] = byDate[ev.date] || []).push(ev);
  });

  // First day of month (0=Sun) and number of days
  const firstDay  = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today     = new Date();
  const todayStr  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Build grid cells: pad before and after
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let cells = '';

  // Header row
  cells += DAY_NAMES.map(d => `<div class="cal-grid-header">${d}</div>`).join('');

  // Pre-month days from previous month
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    cells += `<div class="cal-grid-cell cal-grid-cell--other-month" data-count="0">
      <span class="cal-grid-day-num">${prevMonthDays - i}</span>
    </div>`;
  }

  // Days in current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvents = byDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    const chips   = dayEvents.slice(0, 3).map(ev =>
      `<span class="cal-chip" style="background:${calColor(ev.category)}" title="${esc(ev.title)}">${esc(ev.title)}</span>`
    ).join('');
    const more = dayEvents.length > 3
      ? `<span class="cal-chip cal-chip--more">+${dayEvents.length - 3} more</span>`
      : '';
    cells += `
      <div class="cal-grid-cell${isToday ? ' cal-grid-cell--today' : ''}"
           data-date="${dateStr}" data-count="${dayEvents.length}"
           onclick="showDayDetail('${dateStr}', this)">
        <span class="cal-grid-day-num">${d}</span>
        ${chips}${more}
      </div>`;
  }

  // Post-month filler
  const cellsUsed = firstDay + daysInMonth;
  const remainder = 7 - (cellsUsed % 7);
  if (remainder < 7) {
    for (let d = 1; d <= remainder; d++) {
      cells += `<div class="cal-grid-cell cal-grid-cell--other-month" data-count="0">
        <span class="cal-grid-day-num">${d}</span>
      </div>`;
    }
  }

  container.innerHTML = `<div class="cal-grid-wrap"><div class="cal-grid">${cells}</div></div>`;
}

function showDayDetail(dateStr, cell) {
  const allDay  = (calendarData?.events || []).filter(ev => ev.date === dateStr);
  const events  = calActiveFilter
    ? allDay.filter(ev => (ev.category || '').toLowerCase() === calActiveFilter)
    : allDay;
  const detail = document.getElementById('calDayDetail');
  const body   = document.getElementById('calDayDetailBody');
  const title  = document.getElementById('calDayDetailTitle');

  // Deselect previous
  document.querySelectorAll('.cal-grid-cell--selected').forEach(c => c.classList.remove('cal-grid-cell--selected'));
  cell.classList.add('cal-grid-cell--selected');

  const [y, m, d] = dateStr.split('-').map(Number);
  const label = new Date(y, m-1, d).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  title.textContent = label;

  if (!events.length) {
    body.innerHTML = '<p style="font-size:.875rem;color:#6b7280;padding:.25rem 0">No events this day.</p>';
  } else {
    body.innerHTML = events.map(ev => {
      const color = calColor(ev.category);
      const links = (ev.links || []).map(l =>
        `<a class="cal-detail-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
      ).join('');
      return `
        <div class="cal-detail-event">
          <div class="cal-detail-dot" style="background:${color}"></div>
          <div class="cal-detail-info">
            <div class="cal-detail-name">${esc(ev.title)}</div>
            <div class="cal-detail-meta">
              ${ev.time ? `<i data-lucide="clock" aria-hidden="true" class="lucide-wrap"></i> ${esc(ev.time)}` : ''}
              ${ev.location ? ` · <i data-lucide="map-pin" aria-hidden="true" class="lucide-wrap"></i> ${esc(ev.location)}` : ''}
            </div>
            ${links ? `<div class="cal-detail-links">${links}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  detail.style.display = 'block';
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── List view ─────────────────────────────────────────────────
function renderCalendarList(data, container) {
  const events = calActiveFilter
    ? data.events.filter(ev => (ev.category || '').toLowerCase() === calActiveFilter)
    : data.events;

  if (!events.length) {
    container.innerHTML = '<p style="color:var(--muted)">No events match this filter.</p>';
    return;
  }

  // Group by month
  const byMonth = {};
  events.forEach(ev => {
    const [y, m] = ev.date.split('-');
    const key    = `${y}-${m}`;
    (byMonth[key] = byMonth[key] || []).push(ev);
  });

  container.innerHTML = Object.entries(byMonth).sort().map(([key, evs]) => {
    const [y, m] = key.split('-').map(Number);
    const monthLabel = new Date(y, m-1, 1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    return `
      <div class="cal-month">
        <div class="cal-month-label">${esc(monthLabel)}</div>
        ${evs.map(ev => {
          const d     = new Date(ev.date + 'T00:00:00');
          const color = calColor(ev.category);
          const rel   = relDay(ev.date);
          const links = (ev.links || []).map(l =>
            `<a class="cal-event-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
          ).join('');
          return `
            <div class="cal-event" style="--event-color:${color}">
              <div class="cal-event-date">
                <span class="cal-day-name">${d.toLocaleDateString('en-US',{weekday:'short'})}</span>
                <span class="cal-day-num">${d.getDate()}</span>
              </div>
              <div class="cal-event-body">
                ${ev.category ? `<div class="cal-event-cat">${esc(ev.category)}</div>` : ''}
                <div class="cal-event-title">${esc(ev.title)}</div>
                ${ev.time     ? `<div class="cal-event-time"><i data-lucide="clock" aria-hidden="true" class="lucide-wrap"></i> ${esc(ev.time)}</div>` : ''}
                ${ev.location ? `<div class="cal-event-loc"><i data-lucide="map-pin" aria-hidden="true" class="lucide-wrap"></i> ${esc(ev.location)}</div>` : ''}
                ${rel         ? `<div class="cal-event-rel">${esc(rel)}</div>` : ''}
                ${links}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}

// ── Language Selector ─────────────────────────────────────────
function injectLanguageSelector() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;

  const LANGUAGES = [
    { code: 'es',    label: 'Español' },
    { code: 'ar',    label: 'العربية' },
    { code: 'vi',    label: 'Tiếng Việt' },
    { code: 'zh-CN', label: '中文 (简体)' },
    { code: 'fr',    label: 'Français' },
    { code: 'pt',    label: 'Português' },
    { code: 'hi',    label: 'हिन्दी' },
    { code: 'tl',    label: 'Tagalog' },
    { code: 'ko',    label: '한국어' },
    { code: 'am',    label: 'አማርኛ' },
  ];

  // ── Detect if we're already on a Google Translate proxy page ──
  const CANONICAL = 'https://civichub.nidaallam.com';
  const isTranslated = location.hostname.endsWith('.translate.goog');

  // Always returns the real canonical URL for the current page.
  // On the translate.goog proxy, location.pathname is the same as the real page.
  function pageUrl() {
    return CANONICAL + location.pathname + (location.search || '');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'nav-lang-wrap';

  const btn = document.createElement('button');
  btn.className = 'nav-lang-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Translate this page');
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Language`;

  const dropdown = document.createElement('div');
  dropdown.className = 'nav-lang-dropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.innerHTML =
    `<a class="nav-lang-option nav-lang-option--reset" href="#" data-lang="" role="menuitem">↩ English (original)</a>` +
    LANGUAGES.map(l =>
      `<a class="nav-lang-option" href="#" data-lang="${l.code}" role="menuitem">${l.label}</a>`
    ).join('');

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  nav.appendChild(wrapper);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = wrapper.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // ── Translation via Google Translate proxy ────────────────────
  // Opens translate.google.com which serves the page translated.
  // Always uses the hardcoded canonical domain — no fragile regex.
  function doTranslate(lang) {
    if (!lang) {
      // "Back to English" — go to the real canonical page
      location.href = pageUrl();
      return;
    }
    location.href =
      `https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent(pageUrl())}`;
  }

  dropdown.querySelectorAll('.nav-lang-option').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      wrapper.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      doTranslate(a.dataset.lang);
    });
  });

  document.addEventListener('click', () => {
    wrapper.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });

  // ── Show disclaimer banner when on translated proxy ────────────
  if (isTranslated) {
    const banner = document.createElement('div');
    banner.id = 'translate-disclaimer';
    banner.setAttribute('role', 'status');
    banner.style.cssText =
      'background:var(--navy,#1A2B5F);color:#fff;font-family:\'Libre Franklin\',sans-serif;' +
      'font-size:.82rem;padding:.55rem 1rem;text-align:center;display:flex;align-items:center;' +
      'justify-content:center;gap:.5rem;flex-wrap:wrap;';
    banner.innerHTML =
      '<span>This page is auto-translated. I apologize in advance for any mistakes!</span>' +
      '<button id="translate-reset-btn" style="background:none;border:none;color:#FAD4BD;font-family:\'Libre Franklin\',sans-serif;font-size:.82rem;font-weight:700;text-decoration:underline;cursor:pointer;padding:0;white-space:nowrap;">Back to English</button>';
    document.body.insertBefore(banner, document.body.firstChild);
    document.getElementById('translate-reset-btn')?.addEventListener('click', () => doTranslate(''));
  }
}

// ── Officials (voting page) ───────────────────────────────────
async function loadOfficials() {
  try {
    const res  = await fetch('data/officials.json');
    const data = await res.json();
    renderElections();
    renderOfficials(data);
  } catch {
    // static HTML fallback remains
  }
}

async function renderElections() {
  const container = document.getElementById('electionsContainer');
  if (!container) return;
  try {
    const res  = await fetch('data/elections.json');
    const data = await res.json();
    const { nextElection: ne, earlyVoting: ev, registrationDeadline: rd, source } = data;

    const card = (accentVar, label, dateLabel, desc) => `
      <div style="background:#fff;border:1.5px solid var(--border,#e5e0d8);border-top:4px solid var(--${accentVar},#E97221);border-radius:10px;padding:1.25rem 1.5rem;">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--${accentVar},#E97221);margin-bottom:.4rem;">${label}</div>
        <div style="font-family:'Margin',serif;font-size:1.35rem;font-weight:800;color:var(--navy,#262E4F);">${esc(dateLabel)}</div>
        <div style="font-size:.85rem;color:#555;margin-top:.25rem;">${esc(desc)}</div>
      </div>`;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-bottom:1.25rem;">
        ${card('orange', 'Next Election', ne.label, ne.type)}
        ${card('teal',   'Early Voting',  ev.label, ev.desc)}
        ${card('navy',   'Voter Reg. Deadline', rd.label, rd.note)}
      </div>
      <p style="font-size:.82rem;color:#888;font-style:italic;margin-bottom:0;">
        Dates from the <a href="${esc(source)}" target="_blank" rel="noopener" style="color:var(--teal);">NC State Board of Elections 2026 election calendar</a>. Confirm before election day.
      </p>`;

    // Countdown
    const countdownEl = document.getElementById('electionCountdown');
    if (countdownEl && ne.date) {
      const today    = new Date();
      const election = new Date(ne.date + 'T00:00:00');
      const days     = Math.ceil((election - today) / 86400000);
      if (days > 0) {
        countdownEl.innerHTML = `<span class="countdown-num${days <= 30 ? ' countdown-soon' : ''}">${days}</span> days until the ${esc(ne.label)} general election`;
        countdownEl.style.display = 'block';
      }
    }
  } catch {
    // static content remains
  }
}

function renderOfficials(data) {
  const container = document.getElementById('officialsContainer');
  if (!container) return;

  container.innerHTML = data.groups.map(group => {
    const noteHtml = group.note
      ? `<p style="font-size:.82rem;color:var(--text-muted);margin-bottom:.85rem;">${esc(group.note)}${
          group.noteLink
            ? ` Full bios at <a href="${esc(group.noteLink.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--teal)">${esc(group.noteLink.label)}</a>.`
            : ''
        }</p>`
      : '';

    const cards = group.officials.map(o => {
      const partyBadge = o.party
        ? `<span class="official-party party-${o.party === 'Democrat' ? 'd' : 'r'}">${esc(o.party)}</span>`
        : '';
      const photoEl = o.photo
        ? `<img class="official-photo" src="${esc(o.photo)}" alt="${esc(o.name)}" loading="lazy"
               referrerpolicy="no-referrer"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const initialsEl = (o.initials && o.initials.length <= 2)
        ? `<div class="official-initials">${esc(o.initials)}</div>`
        : `<div class="official-photo-wrap" style="background:var(--teal);display:flex;align-items:center;justify-content:center;font-size:2.5rem">${o.initials}</div>`;

      return `
        <a class="official-card" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">
          <div class="official-photo-wrap">
            ${photoEl}
            ${o.photo ? initialsEl : ''}
            ${!o.photo ? `<div style="width:100%;height:100%;background:var(--teal);display:flex;align-items:center;justify-content:center;font-size:2.5rem;">${esc(o.initials)}</div>` : ''}
          </div>
          <div class="official-info">
            <div class="official-name">${esc(o.name)}</div>
            <div class="official-title">${esc(o.title)}</div>
            ${partyBadge}
          </div>
        </a>`;
    }).join('');

    return `
      <div class="officials-group">
        <div class="officials-group-label">${esc(group.label)}</div>
        ${noteHtml}
        <div class="officials-grid">${cards}</div>
      </div>`;
  }).join('');

  if (window._twParse) window._twParse(container);
}

// ── Resources page ────────────────────────────────────────────
async function loadResources() {
  const container = document.getElementById('resourcesContainer');
  if (!container) return;
  try {
    const res  = await fetch('data/resources.json');
    const data = await res.json();
    renderResources(data, container);
    updateDataTimestamp('data-updated', data.lastUpdated);
  } catch {
    // static HTML fallback remains
  }
}

function renderResources(data, container) {
  // Crisis cards to pin at top
  const crisisCards = data.categories
    .flatMap(c => (c.cards || []).filter(card => card.isCrisis)
      .map(card => ({ ...card, catId: c.id }))
    );

  const crisisSection = crisisCards.length ? `
    <section class="resource-category" id="crisis-pinned" style="background:#7B1A1A;border-radius:12px;padding:1.5rem 1.5rem 1.75rem;margin-bottom:2.5rem;">
      <div class="resource-category-header">
        <h2 class="resource-category-title" style="color:#fff;border-bottom-color:rgba(255,255,255,.4);"><i data-lucide="alert-circle" aria-hidden="true" class="lucide-wrap"></i> Most Urgent</h2>
        <p class="resource-category-intro" style="color:rgba(255,255,255,.85);">In a life-threatening emergency, call <strong>911</strong>. Crisis lines available 24/7.</p>
      </div>
      <div class="resource-grid">
        ${crisisCards.map(c => renderResourceCard(c, true)).join('')}
      </div>
    </section>` : '';

  const categories = data.categories.map(cat => {
    const noteHtml = cat.note
      ? `<p class="resource-category-note">${esc(cat.note)}</p>`
      : '';
    return `
      <section class="resource-category" id="${esc(cat.id)}">
        <div class="resource-category-header">
          <h2 class="resource-category-title"><i data-lucide="${esc(cat.icon || 'circle')}" aria-hidden="true" class="lucide-wrap"></i> ${esc(cat.title)}</h2>
          ${cat.intro ? `<p class="resource-category-intro">${esc(cat.intro)}</p>` : ''}
          ${noteHtml}
        </div>
        <div class="resource-grid">
          ${(cat.cards || []).map(c => renderResourceCard(c, false)).join('')}
        </div>
      </section>`;
  }).join('');

  container.innerHTML = crisisSection + categories;
  if (window._twParse) window._twParse(container);
  if (window.lucide) lucide.createIcons();
}

function renderResourceCard(c, dark) {
  const phoneHtml = c.phone
    ? `<p class="resource-card-phone"><i data-lucide="phone" aria-hidden="true" class="lucide-wrap"></i> <a href="${esc(c.phoneHref)}">${esc(c.phone)}</a></p>`
    : '';
  const spanishBadge = c.hasSpanish
    ? `<span style="font-size:.7rem;font-weight:700;background:#16a34a;color:#fff;padding:.1rem .4rem;border-radius:3px;margin-left:.25rem;">Español</span>`
    : '';
  const cardStyle = dark ? 'background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2);' : '';
  const nameStyle = dark ? 'color:#fff;' : '';
  const descStyle = dark ? 'color:rgba(255,255,255,.85);' : '';

  return `
    <div class="resource-card resource-card--${esc(c.type || 'nonprofit')}" style="${cardStyle}">
      <div class="resource-card-icon"><i data-lucide="${esc(c.icon || 'circle')}" aria-hidden="true" class="lucide-wrap"></i></div>
      <p class="resource-card-name" style="${nameStyle}">${esc(c.name)}${spanishBadge}</p>
      <p class="resource-card-desc" style="${descStyle}">${esc(c.desc)}</p>
      ${phoneHtml}
      <a href="${esc(c.url)}" class="resource-card-btn" target="_blank" rel="noopener">${esc(c.btnLabel || 'Learn More')}</a>
    </div>`;
}

// ── Resource search ────────────────────────────────────────────
let _resourcesData = null;

function filterResources(q) {
  const container = document.getElementById('resourcesContainer');
  if (!container || !_resourcesData) return;
  if (!q) {
    renderResources(_resourcesData, container);
    return;
  }
  const lower = q.toLowerCase();
  const filtered = {
    ..._resourcesData,
    categories: _resourcesData.categories.map(cat => ({
      ...cat,
      cards: (cat.cards || []).filter(c =>
        (c.name + ' ' + c.desc + ' ' + cat.title).toLowerCase().includes(lower)
      )
    })).filter(cat => cat.cards.length > 0)
  };
  renderResources(filtered, container);
}

// ── Footer "data last updated" ─────────────────────────────────
async function injectFooterTimestamp() {
  try {
    const res  = await fetch('data/meta.json');
    const data = await res.json();
    if (!data.lastUpdated) return;
    const footer = document.querySelector('.footer-inner');
    if (!footer) return;
    const p = document.createElement('p');
    p.className = 'footer-note';
    p.style.cssText = 'margin-top:.35rem;font-size:.78rem;opacity:.65;';
    p.textContent = `Site data last updated: ${fmt(data.lastUpdated)}`;
    const nav = footer.querySelector('.footer-nav');
    if (nav) footer.insertBefore(p, nav);
    else footer.appendChild(p);
  } catch {
    // no-op
  }
}

function updateDataTimestamp(id, dateStr) {
  const el = document.getElementById(id);
  if (el && dateStr) el.textContent = `Updated ${fmt(dateStr)}`;
}

// ── Weather Alerts ────────────────────────────────────────────
// Reads from data/alerts.json written by GitHub Actions (bypasses NWS CORS)
async function fetchWeatherAlerts() {
  try {
    const res = await fetch('data/alerts.json');
    if (!res.ok) return;
    const data = await res.json();
    const alerts = data.alerts || [];
    if (!alerts.length) return;

    const a = alerts[0];
    const banner = document.createElement('div');
    banner.id = 'weatherAlertBanner';
    banner.style.cssText = [
      'background:#7B1A1A',
      'color:#fff',
      'font-family:"Libre Franklin",sans-serif',
      'font-size:.88rem',
      'line-height:1.5',
      'padding:.65rem 1.25rem',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:.75rem',
      'flex-wrap:wrap',
      'text-align:center',
      'position:relative'
    ].join(';');

    const eventText = esc(a.event || 'Weather Alert');
    const headline = a.headline ? ': ' + esc(a.headline.replace(/\.\s*$/, '')) : '';
    const url = a.url || 'https://alerts.weather.gov/search?zone=NCC063';
    banner.innerHTML = `<span><i data-lucide="alert-triangle" aria-hidden="true" class="lucide-wrap"></i> <strong>${eventText}</strong>${headline}</span>`
      + `<a href="${esc(url)}" target="_blank" rel="noopener"`
      + ` style="color:#ffc8a0;font-weight:700;white-space:nowrap;text-decoration:underline;">Full alert →</a>`;

    // Insert before the header so it scrolls away naturally and never overlaps the sticky nav
    const header = document.querySelector('.site-header');
    if (header) header.before(banner);
    else document.body.prepend(banner);
  } catch (_) {}
}

// ── Feedback widget ───────────────────────────────────────────
function injectFeedbackWidget() {
  const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdL2mJNFVTuGrXr-nCKaLx98BdkYObzoAsqbloLqKrS1KQN0g/viewform?embedded=true';

  const widget = document.createElement('div');
  widget.id = 'fb-widget';
  widget.innerHTML = `
    <div id="fb-tooltip">
      <span>Got feedback? We'd love to hear it!</span>
      <button id="fb-tooltip-close" aria-label="Dismiss">✕</button>
    </div>
    <button id="fb-btn" aria-label="Open feedback form" aria-expanded="false">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      Feedback
    </button>
    <div id="fb-panel" role="dialog" aria-modal="true" aria-label="Feedback form" hidden>
      <div class="fb-panel-header">
        <span>💬 Civic Hub Feedback</span>
        <button id="fb-close" aria-label="Close feedback form">✕</button>
      </div>
      <div class="fb-panel-body">
        <iframe src="${FORM_URL}" title="Civic Hub Feedback Form" frameborder="0" marginheight="0" marginwidth="0" loading="lazy">Loading…</iframe>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  const btn          = document.getElementById('fb-btn');
  const panel        = document.getElementById('fb-panel');
  const closeBtn     = document.getElementById('fb-close');
  const tooltip      = document.getElementById('fb-tooltip');
  const tooltipClose = document.getElementById('fb-tooltip-close');

  function openPanel() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    tooltip.classList.remove('fb-tooltip--visible');
    btn.classList.add('fb-btn--active');
  }
  function closePanel() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('fb-btn--active');
  }
  function dismissTooltip() {
    tooltip.classList.remove('fb-tooltip--visible');
    sessionStorage.setItem('fb-tooltip-seen', '1');
  }

  btn.addEventListener('click', () => panel.hidden ? openPanel() : closePanel());
  closeBtn.addEventListener('click', closePanel);
  tooltipClose.addEventListener('click', e => { e.stopPropagation(); dismissTooltip(); });
  tooltip.addEventListener('click', openPanel);

  // Close on outside click
  document.addEventListener('click', e => {
    if (!panel.hidden && !widget.contains(e.target)) closePanel();
  });
  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  // Show tooltip once per session after a short delay
  if (!sessionStorage.getItem('fb-tooltip-seen')) {
    setTimeout(() => {
      tooltip.classList.add('fb-tooltip--visible');
      setTimeout(dismissTooltip, 6000);
    }, 2000);
  }
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inject search UI, nav dropdowns, and language selector on every page
  injectSearchUI();
  buildNavDropdowns();
  injectLanguageSelector();
  injectFeedbackWidget();
  fetchWeatherAlerts();

  // Load Lucide icons (replaces emoji with consistent SVG icons)
  const lcScript = document.createElement('script');
  lcScript.src = 'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js';
  lcScript.crossOrigin = 'anonymous';
  lcScript.onload = () => {
    lucide.createIcons();
    window._lcIcons = (el) => lucide.createIcons({ nodes: el ? [el] : undefined });
  };
  document.head.appendChild(lcScript);

  // News search wiring
  const ns = document.getElementById('newsSearch');
  if (ns) {
    ns.addEventListener('input', e => {
      searchQuery = e.target.value;
      renderStories();
    });
  }

  // Resources search wiring
  const rs = document.getElementById('resourceSearch');
  if (rs) {
    rs.addEventListener('input', e => filterResources(e.target.value.trim()));
  }

  // Page-specific init
  const page = document.body.dataset.page;
  switch (page) {
    case 'home':
    case 'news':
      loadNews();
      break;
    case 'meetings':
      loadMeetings();
      break;
    case 'calendar':
      loadCalendar();
      break;
    case 'voting':
      loadOfficials();
      break;
    case 'resources':
      (async () => {
        const res  = await fetch('data/resources.json').catch(() => null);
        if (!res) return;
        _resourcesData = await res.json();
        const container = document.getElementById('resourcesContainer');
        if (container) renderResources(_resourcesData, container);
        updateDataTimestamp('data-updated', _resourcesData.lastUpdated);
      })();
      break;
  }
});

// ── Service Worker registration ──────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Universal "last updated" footer note ────────────────────────────────────
// Runs on every page. Pages with specific data sources show a source link;
// all other pages fall back to meta.json for a global "site last updated" stamp.
(function injectLastUpdated() {
  const PAGE_SOURCES = {
    'news.html':            { file: 'data/news.json',      key: 'updated',     label: 'Durham County government sources',           url: 'https://www.dconc.gov/' },
    'meetings.html':        { file: 'data/meetings.json',  key: 'updated',     label: 'dconc.gov, durhamnc.gov, dpsnc.net',         url: 'https://www.dconc.gov/Board-of-Commissioners/Meetings-and-Announcements/BOCC-Agendas-and-Video-Library' },
    'budget-explorer.html': { file: 'data/budget-data.json', key: 'lastUpdated', label: 'Durham County Budget & Management Services', url: 'https://www.dconc.gov/Budget-and-Management-Services' },
    'budget-county.html':   { file: 'data/budget-data.json', key: 'lastUpdated', label: 'Durham County Budget & Management Services', url: 'https://www.dconc.gov/Budget-and-Management-Services' },
    'budget-city.html':     { file: 'data/budget-data.json', key: 'lastUpdated', label: 'City of Durham Finance Department',          url: 'https://www.durhamnc.gov/456/Finance' },
    'budget-schools.html':  { file: 'data/budget-data.json', key: 'lastUpdated', label: 'Durham Public Schools Finance',              url: 'https://www.dpsnc.net/Page/3507' },
    'resources.html':       { file: 'data/resources.json',  key: 'lastUpdated', label: 'Official program websites',                  url: 'https://www.dconc.gov/' },
    'voting.html':          { file: 'data/officials.json',  key: 'lastUpdated', label: 'NC State Board of Elections',                url: 'https://www.ncsbe.gov/' },
    'my-durham.html':       { file: 'data/officials.json',  key: 'lastUpdated', label: 'Durham County & NC election data',           url: 'https://www.dconc.gov/' },
    'cip.html':             { file: 'data/cip-data.json',   key: 'updated',     label: 'Durham County CIP documents',                url: 'https://www.dconc.gov/Budget-and-Management-Services' },
  };

  const page   = window.location.pathname.split('/').pop() || 'index.html';
  const cfg    = PAGE_SOURCES[page];

  // Fall back to global meta.json for pages not in PAGE_SOURCES
  const file   = cfg ? cfg.file  : 'data/meta.json';
  const key    = cfg ? cfg.key   : 'lastUpdated';
  const label  = cfg ? cfg.label : null;
  const srcUrl = cfg ? cfg.url   : null;

  const footer = document.querySelector('.site-footer .footer-inner');
  if (!footer) return;

  fetch(file)
    .then(r => r.json())
    .then(data => {
      const ts = data[key];
      if (!ts || typeof ts !== 'string') return;
      let display = ts;
      try {
        const d = new Date(ts + 'T00:00:00');
        if (!isNaN(d)) {
          display = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        }
      } catch (_) {}
      const el = document.createElement('p');
      el.className = 'footer-note footer-last-updated';
      if (label && srcUrl) {
        el.innerHTML = `Data last updated: <strong style="color:#fff">${display}</strong> &middot; Source: <a href="${srcUrl}" target="_blank" rel="noopener" style="color:var(--peach)">${label}</a>`;
      } else {
        el.innerHTML = `Site data last updated: <strong style="color:#fff">${display}</strong>`;
      }
      footer.appendChild(el);
    })
    .catch(() => {});
})();
