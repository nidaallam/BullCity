/* =========================================================
   Durham Civic Hub — app.js
   Handles: news feed, meetings, calendar, budget charts
   ========================================================= */

'use strict';

/* ── Helpers ──────────────────────────────────────────── */

function fmt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function relativeDay(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 6) return `In ${diff} days`;
  if (diff < -1 && diff >= -6) return `${Math.abs(diff)} days ago`;
  return null;
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/* ── Mobile nav toggle ────────────────────────────────── */

function toggleNav() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  nav.classList.toggle('open');
}

/* ── News ─────────────────────────────────────────────── */

let allStories = [];
let activeTag = null;

async function loadNews() {
  const grid = document.getElementById('storiesGrid');
  if (!grid) return;

  try {
    const res = await fetch('news.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    allStories = data.stories || [];

    const updEl = document.getElementById('newsUpdated');
    if (updEl && data.updated) {
      updEl.textContent = 'Updated ' + fmt(data.updated) + ' · Curated local news from Durham County sources';
    }

    renderStories(allStories);
    buildTagFilters(allStories);
  } catch (e) {
    console.warn('news.json load failed, using fallback HTML:', e.message);
    // Keep whatever hardcoded HTML is already in #storiesGrid
  }
}

function buildTagFilters(stories) {
  const bar = document.getElementById('tagFilters');
  if (!bar) return;

  const tags = [...new Set(stories.map(s => s.tag).filter(Boolean))].sort();
  bar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'tag-btn active';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => filterByTag(null, allBtn));
  bar.appendChild(allBtn);

  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.textContent = tag;
    btn.addEventListener('click', () => filterByTag(tag, btn));
    bar.appendChild(btn);
  });
}

function filterByTag(tag, btn) {
  activeTag = tag;
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderStories(tag ? allStories.filter(s => s.tag === tag) : allStories);
}

function filterStories(query) {
  if (!query) {
    renderStories(activeTag ? allStories.filter(s => s.tag === activeTag) : allStories);
    return;
  }
  const q = query.toLowerCase();
  const filtered = allStories.filter(s =>
    (s.title && s.title.toLowerCase().includes(q)) ||
    (s.excerpt && s.excerpt.toLowerCase().includes(q)) ||
    (s.tag && s.tag.toLowerCase().includes(q))
  );
  renderStories(filtered);
}

function renderStories(stories) {
  const grid = document.getElementById('storiesGrid');
  if (!grid) return;

  if (!stories || stories.length === 0) {
    grid.innerHTML = '<p class="no-results">No stories found.</p>';
    return;
  }

  grid.innerHTML = stories.map((s, i) => `
    <article class="story-card${i === 0 ? ' story-card--lead' : ''}">
      <div class="story-meta">
        ${s.tag ? `<span class="story-tag">${s.tag}</span>` : ''}
        <span class="story-source">${s.source || ''}</span>
        <span class="story-date">${s.displayDate || fmt(s.date) || ''}</span>
      </div>
      <h3 class="story-title">
        <a href="${s.link || '#'}" target="_blank" rel="noopener">${s.title}</a>
      </h3>
      ${s.excerpt ? `<p class="story-excerpt">${s.excerpt}</p>` : ''}
      <a class="story-read-more" href="${s.link || '#'}" target="_blank" rel="noopener">Read more →</a>
    </article>
  `).join('');
}

/* ── Meetings ─────────────────────────────────────────── */

async function loadMeetings() {
  const container = document.getElementById('meetingsContainer');
  if (!container) return;

  try {
    const res = await fetch('meetings.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderMeetings(data.bodies || []);
  } catch (e) {
    console.warn('meetings.json load failed:', e.message);
    container.innerHTML = '<p class="load-error">Could not load meeting data. <a href="https://www.dconc.gov">Visit dconc.gov</a> for current schedules.</p>';
  }
}

function renderMeetings(bodies) {
  const container = document.getElementById('meetingsContainer');
  if (!container) return;

  container.innerHTML = bodies.map(body => {
    const upcoming = (body.meetings || []).filter(m => m.status === 'upcoming');
    const past = (body.meetings || []).filter(m => m.status === 'minutes' || m.status === 'cancelled');

    return `
      <section class="meeting-body" id="${body.id}">
        <div class="meeting-body-header">
          <h2 class="meeting-body-name">${body.name}</h2>
          <p class="meeting-body-desc">${body.description}</p>
          <div class="meeting-body-meta">
            <span class="meeting-schedule">📅 ${body.schedule}</span>
            <span class="meeting-loc">📍 ${body.location}</span>
          </div>
        </div>

        ${upcoming.length > 0 ? `
          <div class="meetings-section">
            <h3 class="meetings-section-label">Upcoming</h3>
            ${upcoming.map(m => renderMeetingRow(m)).join('')}
          </div>
        ` : ''}

        ${past.length > 0 ? `
          <div class="meetings-section meetings-section--past">
            <h3 class="meetings-section-label">Recent Minutes &amp; Video</h3>
            ${past.map(m => renderMeetingRow(m)).join('')}
          </div>
        ` : ''}

        <a class="archive-link" href="${body.archiveUrl}" target="_blank" rel="noopener">Full Archive →</a>
      </section>
    `;
  }).join('');
}

function renderMeetingRow(m) {
  const rel = relativeDay(m.date);
  const statusClass = m.status === 'cancelled' ? 'meeting-status--cancelled' :
                      m.status === 'minutes' ? 'meeting-status--past' : 'meeting-status--upcoming';
  const statusLabel = m.status === 'cancelled' ? 'Cancelled' :
                      m.status === 'minutes' ? 'Minutes Available' : 'Upcoming';

  const primaryLink = (m.links || []).find(l => l.primary) || m.links?.[0];
  const extraLinks = (m.links || []).filter(l => !l.primary);

  return `
    <div class="meeting-row">
      <div class="meeting-row-date">
        <span class="meeting-date-display">${fmt(m.date)}</span>
        ${rel ? `<span class="meeting-rel-day">${rel}</span>` : ''}
      </div>
      <div class="meeting-row-info">
        <span class="meeting-type">${m.type || 'Meeting'}</span>
        <span class="meeting-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="meeting-row-links">
        ${primaryLink ? `<a class="meeting-link meeting-link--primary" href="${primaryLink.url}" target="_blank" rel="noopener">${primaryLink.label}</a>` : ''}
        ${extraLinks.map(l => `<a class="meeting-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('')}
      </div>
    </div>
  `;
}

/* ── Calendar ─────────────────────────────────────────── */

const CAT_COLORS = {
  announcement: '#E97221',
  government:   '#262E4F',
  budget:       '#B8393A',
  schools:      '#207C91',
  hearing:      '#9B4DCA',
  community:    '#2E7D32',
  health:       '#C62828'
};

let allEvents = [];
let activeCalCat = null;

async function loadCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;

  try {
    const res = await fetch('calendar.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    allEvents = data.events || [];
    renderCalendar(allEvents);
    buildCalCatFilters(allEvents);
  } catch (e) {
    console.warn('calendar.json load failed:', e.message);
    container.innerHTML = '<p class="load-error">Could not load calendar data. <a href="https://www.dconc.gov">Visit dconc.gov</a> for current events.</p>';
  }
}

function buildCalCatFilters(events) {
  const bar = document.getElementById('calCatFilters');
  if (!bar) return;

  const cats = [...new Set(events.map(e => e.category).filter(Boolean))].sort();
  bar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'tag-btn active';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => filterCalByCat(null, allBtn));
  bar.appendChild(allBtn);

  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn';
    btn.style.setProperty('--cat-color', CAT_COLORS[cat] || '#555');
    btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    btn.addEventListener('click', () => filterCalByCat(cat, btn));
    bar.appendChild(btn);
  });
}

function filterCalByCat(cat, btn) {
  activeCalCat = cat;
  document.querySelectorAll('#calCatFilters .tag-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCalendar(cat ? allEvents.filter(e => e.category === cat) : allEvents);
}

function renderCalendar(events) {
  const container = document.getElementById('calendarContainer');
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = '<p class="no-results">No events found.</p>';
    return;
  }

  // Group by month
  const months = {};
  events.forEach(ev => {
    const key = ev.date.slice(0, 7); // YYYY-MM
    if (!months[key]) months[key] = [];
    months[key].push(ev);
  });

  container.innerHTML = Object.keys(months).sort().map(key => {
    const [year, month] = key.split('-');
    const label = new Date(parseInt(year), parseInt(month) - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return `
      <div class="cal-month">
        <h3 class="cal-month-label">${label}</h3>
        ${months[key].map(ev => renderCalEvent(ev)).join('')}
      </div>
    `;
  }).join('');
}

function renderCalEvent(ev) {
  const color = CAT_COLORS[ev.category] || '#555';
  const rel = relativeDay(ev.date);
  const d = new Date(ev.date + 'T00:00:00');
  const dayNum = d.getDate();
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

  return `
    <div class="cal-event" style="--event-color: ${color}">
      <div class="cal-event-date">
        <span class="cal-day-name">${dayName}</span>
        <span class="cal-day-num">${dayNum}</span>
      </div>
      <div class="cal-event-body">
        <div class="cal-event-cat">${ev.category}</div>
        <div class="cal-event-title">${ev.title}</div>
        <div class="cal-event-time">${ev.time}</div>
        ${ev.location ? `<div class="cal-event-loc">📍 ${ev.location}</div>` : ''}
        ${rel ? `<div class="cal-event-rel">${rel}</div>` : ''}
        ${(ev.links || []).map(l => `<a class="cal-event-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('')}
      </div>
    </div>
  `;
}

/* ── Budget Page ──────────────────────────────────────── */

const BUDGET_DATA = {
  totalRevenue: 726.4,
  totalExpenses: 726.4,
  revenueBreakdown: [
    { label: 'Property Tax',        amount: 398.2, pct: 54.8 },
    { label: 'State & Federal Aid', amount: 163.4, pct: 22.5 },
    { label: 'Sales Tax',           amount: 87.3,  pct: 12.0 },
    { label: 'Fees & Other',        amount: 77.5,  pct: 10.7 }
  ],
  departments: [
    { name: 'Durham Public Schools', fy26: 388.1, fy27req: 412.2, change: 6.2  },
    { name: 'Health & Human Svcs',   fy26: 98.4,  fy27req: 104.1, change: 5.8  },
    { name: 'Sheriff / Courts',      fy26: 72.6,  fy27req: 75.9,  change: 4.5  },
    { name: 'Debt Service',          fy26: 58.3,  fy27req: 61.0,  change: 4.6  },
    { name: 'General Government',    fy26: 34.8,  fy27req: 36.2,  change: 4.0  },
    { name: 'Parks & Recreation',    fy26: 22.1,  fy27req: 23.4,  change: 5.9  },
    { name: 'Library',               fy26: 14.2,  fy27req: 14.9,  change: 4.9  },
    { name: 'Other / Reserves',      fy26: 17.9,  fy27req: 18.7,  change: 4.5  }
  ],
  timeline: [
    { date: 'Apr 10',  label: 'Public Input Period Opens' },
    { date: 'Apr 24',  label: 'Public Hearing — FY2027 Budget' },
    { date: 'Apr 28',  label: 'BOCC Budget Work Session' },
    { date: 'May 19',  label: 'County Manager Recommendation' },
    { date: 'Jun 2',   label: 'Budget Adoption Vote' },
    { date: 'Jul 1',   label: 'New Fiscal Year Begins' }
  ]
};

function renderBudgetPage() {
  renderRevenue();
  renderDeptTable();
  renderTimeline();
}

function renderRevenue() {
  const el = document.getElementById('revenueBreakdown');
  if (!el) return;

  el.innerHTML = BUDGET_DATA.revenueBreakdown.map(row => `
    <div class="rev-row">
      <div class="rev-label">${row.label}</div>
      <div class="rev-bar-wrap">
        <div class="rev-bar" style="width: ${row.pct}%"></div>
      </div>
      <div class="rev-pct">${row.pct}%</div>
      <div class="rev-amt">$${row.amount}M</div>
    </div>
  `).join('');
}

function renderBudgetBars() {
  const el = document.getElementById('deptBars');
  if (!el) return;

  const max = Math.max(...BUDGET_DATA.departments.map(d => d.fy27req));

  el.innerHTML = BUDGET_DATA.departments.map(d => `
    <div class="dept-bar-row">
      <div class="dept-bar-label">${d.name}</div>
      <div class="dept-bar-track">
        <div class="dept-bar dept-bar--fy26" style="width: ${(d.fy26 / max * 100).toFixed(1)}%">
          <span class="dept-bar-val">FY26 $${d.fy26}M</span>
        </div>
        <div class="dept-bar dept-bar--fy27" style="width: ${(d.fy27req / max * 100).toFixed(1)}%">
          <span class="dept-bar-val">FY27 req $${d.fy27req}M</span>
        </div>
      </div>
      <div class="dept-bar-change ${d.change > 0 ? 'positive' : 'negative'}">
        ${d.change > 0 ? '+' : ''}${d.change}%
      </div>
    </div>
  `).join('');
}

function renderDeptTable() {
  const el = document.getElementById('deptTable');
  if (!el) return;

  const rows = BUDGET_DATA.departments.map(d => `
    <tr>
      <td>${d.name}</td>
      <td class="num">$${d.fy26}M</td>
      <td class="num">$${d.fy27req}M</td>
      <td class="num change ${d.change > 0 ? 'positive' : 'negative'}">${d.change > 0 ? '+' : ''}${d.change}%</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <table class="budget-table">
      <thead>
        <tr>
          <th>Department / Area</th>
          <th class="num">FY2026 Adopted</th>
          <th class="num">FY2027 Requested</th>
          <th class="num">Change</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td><strong>Total</strong></td>
          <td class="num"><strong>$${BUDGET_DATA.departments.reduce((a, d) => +(a + d.fy26).toFixed(1), 0)}M</strong></td>
          <td class="num"><strong>$${BUDGET_DATA.departments.reduce((a, d) => +(a + d.fy27req).toFixed(1), 0)}M</strong></td>
          <td class="num"></td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderTimeline() {
  const el = document.getElementById('budgetTimeline');
  if (!el) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  el.innerHTML = `
    <div class="timeline">
      ${BUDGET_DATA.timeline.map(step => `
        <div class="timeline-step">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <span class="timeline-date">${step.date}</span>
            <span class="timeline-label">${step.label}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ── Search ───────────────────────────────────────────── */

function initSearch() {
  const input = document.getElementById('newsSearch');
  if (!input) return;
  input.addEventListener('input', e => filterStories(e.target.value.trim()));
}

/* ── Init ─────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page || '';

  switch (page) {
    case 'home':
      loadNews();
      initSearch();
      break;
    case 'meetings':
      loadMeetings();
      break;
    case 'calendar':
      loadCalendar();
      break;
    case 'budget':
      renderBudgetPage();
      break;
  }
});
