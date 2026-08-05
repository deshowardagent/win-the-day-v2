/* ===================== data ===================== */

const ROSTER = {
  des:    { name: 'Des',    pairKey: 'connor', admin: true },
  connor: { name: 'Connor', pairKey: 'des' },
  landon: { name: 'Landon', pairKey: 'liv' },
  liv:    { name: 'Liv',    pairKey: 'landon' },
  jade:   { name: 'Jade',   pairKey: 'toni' },
  toni:   { name: 'Toni',   pairKey: 'jade' },
};
const PAIRS = [['des', 'connor'], ['landon', 'liv'], ['jade', 'toni']];
const CATEGORIES = ['', 'health', 'wealth', 'relationships', 'spiritual'];
const BOOK_BENCHMARK = 60;
const WEEKLY_TARGET = 70;
const DEADLINE_HOUR = 5; // 5:00 AM
// Rollout went live the evening of Aug 4, after that day's 5:00 AM cutoff had already
// passed — nobody could have logged on time, so that one date is exempt from auto-DQ.
const DQ_EXEMPT_DATES = ['2026-08-04'];
function isDqExempt(dstr) { return DQ_EXEMPT_DATES.includes(dstr); }
function effectiveDq(entry) { return entry.dq && !isDqExempt(entry.date); }

/* ===================== state ===================== */

const STORAGE_KEY = 'wtd_v2_state';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return { currentUser: null, entries: [], prizeLog: [] };
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();

/* ===================== date helpers ===================== */

function dateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() { return dateStr(new Date()); }
function dayTypeOf(dstr) {
  const dow = new Date(dstr + 'T12:00:00').getDay();
  return (dow === 0 || dow === 6) ? 'weekend' : 'weekday';
}
function deadlineFor(dstr) { return new Date(dstr + `T0${DEADLINE_HOUR}:00:00`); }
function prettyDate(dstr) {
  return new Date(dstr + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
function prettyTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';
}
function lastNDates(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dateStr(d));
  }
  return out;
}

/* ===================== entry helpers ===================== */

function blankGoal() { return { title: '', category: '', subItems: [], completedManual: false }; }
function blankEntry(user, dstr) {
  return {
    id: `${user}_${dstr}`, user, date: dstr, dayType: dayTypeOf(dstr),
    goalsCreatedAt: null, submittedAt: null,
    lessonLearned: '', tomorrowFocus: '', affirmation: '', bookPage: null,
    goals: [blankGoal(), blankGoal(), blankGoal(), blankGoal(), blankGoal()],
    dq: false, legacy: false,
  };
}
function findEntry(user, dstr) { return state.entries.find(e => e.user === user && e.date === dstr); }
function getOrCreateEntry(user, dstr) {
  let e = findEntry(user, dstr);
  if (!e) { e = blankEntry(user, dstr); state.entries.push(e); }
  return e;
}
function goalComplete(g) {
  if (g.subItems.length) return g.subItems.length > 0 && g.subItems.every(si => si.done);
  return !!g.completedManual;
}
function completedCount(entry) { return entry.goals.filter(goalComplete).length; }
function scoreOf(entry) {
  if (effectiveDq(entry)) return { pct: 0, status: 'dq' };
  const c = completedCount(entry);
  const pct = c * 20;
  const status = c >= 3 ? 'pass' : 'fail';
  return { pct, status };
}
function fieldsLocked(entry) {
  // goal titles/sub-items stay editable until the first "Save goals" — that commit is what
  // timestamps DQ. After that commit, titles/sub-items lock for good; only completion checkboxes
  // stay open, matching "lock goal editing after 5:00 AM" for the normal on-time case.
  return !!entry.goalsCreatedAt;
}

/* ===================== gate / user switching ===================== */

const gateEl = document.getElementById('gate');
const appEl = document.getElementById('app');

function renderGate() {
  const row = document.getElementById('pairRow');
  row.innerHTML = '';
  PAIRS.forEach(pair => {
    const card = document.createElement('div');
    card.className = 'pair-card';
    const label = document.createElement('div');
    label.className = 'pair-card-label';
    label.textContent = `${ROSTER[pair[0]].name} & ${ROSTER[pair[1]].name}`;
    card.appendChild(label);
    pair.forEach(key => {
      const b = document.createElement('button');
      b.className = 'name-btn';
      b.textContent = ROSTER[key].name;
      b.addEventListener('click', () => { state.currentUser = key; saveState(); enterApp(); });
      card.appendChild(b);
    });
    row.appendChild(card);
  });
}

function enterApp() {
  gateEl.classList.add('hidden');
  appEl.classList.remove('hidden');
  const u = ROSTER[state.currentUser];
  document.getElementById('whoName').textContent = u.name;
  document.getElementById('whoPair').textContent = `paired with ${ROSTER[u.pairKey].name}`;
  document.getElementById('view-admin').closest('.views');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !u.admin));
  switchView('today');
}

document.getElementById('switchUser').addEventListener('click', () => {
  appEl.classList.add('hidden');
  gateEl.classList.remove('hidden');
});

/* ===================== tabs / views ===================== */

const RENDERERS = {
  today: renderToday, leaderboard: renderLeaderboard, week: renderWeek,
  book: renderBook, rules: renderRules, admin: renderAdmin,
};
function switchView(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== `view-${name}`));
  RENDERERS[name] && RENDERERS[name]();
}
document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (btn) switchView(btn.dataset.view);
});

/* ===================== gate clock (signature element) ===================== */

function tickClock() {
  const now = new Date();
  const dstr = todayStr();
  const dl = deadlineFor(dstr);
  const el = document.getElementById('gateClock');
  const label = document.getElementById('gcLabel');
  const time = document.getElementById('gcTime');
  let diff = dl - now;
  el.classList.remove('warn', 'closed');
  if (diff > 0) {
    label.textContent = 'GATE CLOSES IN';
    if (diff < 60 * 60 * 1000) el.classList.add('warn');
  } else {
    label.textContent = 'GATE CLOSED — LOCKS AT 5:00 TOMORROW';
    el.classList.add('closed');
    const tomorrow = new Date(dl); tomorrow.setDate(tomorrow.getDate() + 1);
    diff = tomorrow - now;
  }
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  time.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
setInterval(tickClock, 1000);

/* ===================== TODAY view ===================== */

function renderToday() {
  const user = state.currentUser;
  const dstr = todayStr();
  const entry = getOrCreateEntry(user, dstr);

  document.getElementById('entryDate').textContent = prettyDate(dstr);
  document.getElementById('entryDayType').textContent = entry.dayType.toUpperCase();

  const locked = fieldsLocked(entry);
  const submitted = !!entry.submittedAt;
  const pastDeadline = new Date() > deadlineFor(dstr) && !isDqExempt(dstr);
  document.getElementById('lockNote').textContent = locked
    ? (entry.dayType === 'weekend' ? 'Goal text locked — weekend goals must be written the night before.' : 'Goal text locked for the day.')
    : (pastDeadline ? 'Past the 5:00 AM gate — saving now will mark today DQ.'
       : isDqExempt(dstr) ? 'Rollout day grace — today is exempt from the 5:00 AM cutoff.'
       : 'Goal titles lock for good the moment you save them.');

  const stamp = document.getElementById('lpStamp');
  if (submitted) {
    const { status } = scoreOf(entry);
    stamp.hidden = false;
    stamp.className = `lp-stamp ${status}`;
    stamp.textContent = status === 'dq' ? 'DQ' : status.toUpperCase();
  } else stamp.hidden = true;

  document.getElementById('lessonLearned').value = entry.lessonLearned;
  document.getElementById('tomorrowFocus').value = entry.tomorrowFocus;
  document.getElementById('affirmation').value = entry.affirmation;
  document.getElementById('bookPage').value = entry.bookPage ?? '';
  [document.getElementById('lessonLearned'), document.getElementById('tomorrowFocus'),
   document.getElementById('affirmation'), document.getElementById('bookPage')].forEach(el => el.disabled = submitted);

  renderGoals(entry, locked, submitted);
  refreshScorePreview(entry);

  document.getElementById('saveGoals').disabled = locked || submitted;
  document.getElementById('submitDay').disabled = submitted;
  document.getElementById('submitDay').textContent = submitted ? 'Submitted' : "Submit today's log";
  document.getElementById('lpNote').textContent = submitted
    ? 'Logged. Come back tomorrow — before 5:00 AM.'
    : '';
}

function renderGoals(entry, locked, submitted) {
  const wrap = document.getElementById('goalsList');
  wrap.innerHTML = '';
  entry.goals.forEach((g, gi) => {
    const card = document.createElement('div');
    card.className = 'goal-card';

    const top = document.createElement('div');
    top.className = 'goal-card-top';

    const num = document.createElement('span');
    num.className = 'goal-num'; num.textContent = gi + 1;
    top.appendChild(num);

    const titleInput = document.createElement('input');
    titleInput.className = 'goal-title-input' + (goalComplete(g) ? ' done' : '');
    titleInput.value = g.title;
    titleInput.placeholder = 'Needle-mover goal…';
    titleInput.disabled = locked || submitted;
    titleInput.addEventListener('input', () => { g.title = titleInput.value; saveState(); });
    top.appendChild(titleInput);

    const cat = document.createElement('select');
    cat.className = 'goal-cat';
    cat.disabled = locked || submitted;
    CATEGORIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c ? c : 'tag';
      if (c === g.category) opt.selected = true;
      cat.appendChild(opt);
    });
    cat.addEventListener('change', () => { g.category = cat.value; saveState(); });
    top.appendChild(cat);

    if (!g.subItems.length) {
      const done = document.createElement('input');
      done.type = 'checkbox'; done.className = 'goal-complete-toggle';
      done.checked = !!g.completedManual;
      done.disabled = submitted;
      done.addEventListener('change', () => {
        g.completedManual = done.checked; saveState(); renderGoals(entry, locked, submitted); refreshScorePreview(entry);
      });
      top.appendChild(done);
    }
    card.appendChild(top);

    if (g.subItems.length) {
      const subWrap = document.createElement('div');
      subWrap.className = 'subitems';
      g.subItems.forEach((si, si_i) => {
        const row = document.createElement('div');
        row.className = 'subitem-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = si.done; cb.disabled = submitted;
        cb.addEventListener('change', () => {
          si.done = cb.checked; saveState(); renderGoals(entry, locked, submitted); refreshScorePreview(entry);
        });
        row.appendChild(cb);
        const txt = document.createElement('input');
        txt.className = 'subitem-text' + (si.done ? ' done' : '');
        txt.value = si.text; txt.placeholder = `sub-item ${si_i + 1}`;
        txt.disabled = locked || submitted;
        txt.addEventListener('input', () => { si.text = txt.value; saveState(); });
        row.appendChild(txt);
        if (!locked && !submitted) {
          const rm = document.createElement('button');
          rm.className = 'subitem-remove'; rm.textContent = '×'; rm.type = 'button';
          rm.addEventListener('click', () => {
            g.subItems.splice(si_i, 1); saveState(); renderGoals(entry, locked, submitted); refreshScorePreview(entry);
          });
          row.appendChild(rm);
        }
        subWrap.appendChild(row);
      });
      card.appendChild(subWrap);
    }

    if (!locked && !submitted) {
      const actions = document.createElement('div');
      actions.className = 'goal-sub-actions';
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'add-sub-btn';
      addBtn.textContent = '+ sub-item';
      addBtn.disabled = g.subItems.length >= 5;
      addBtn.addEventListener('click', () => {
        g.subItems.push({ text: '', done: false }); saveState(); renderGoals(entry, locked, submitted); refreshScorePreview(entry);
      });
      actions.appendChild(addBtn);
      card.appendChild(actions);
    }

    wrap.appendChild(card);
  });
}

function refreshScorePreview(entry) {
  const { pct, status } = scoreOf(entry);
  const big = document.getElementById('scoreBig');
  const st = document.getElementById('scoreStatus');
  big.textContent = entry.submittedAt || entry.goalsCreatedAt ? `${pct}%` : '—';
  st.textContent = entry.submittedAt ? (status === 'dq' ? 'DISQUALIFIED' : status.toUpperCase()) : '';
  st.className = `score-status ${status}`;
}

function bindStaticFieldListeners() {
  ['lessonLearned', 'tomorrowFocus', 'affirmation'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const entry = getOrCreateEntry(state.currentUser, todayStr());
      entry[id] = document.getElementById(id).value;
      saveState();
    });
  });
  document.getElementById('bookPage').addEventListener('input', () => {
    const entry = getOrCreateEntry(state.currentUser, todayStr());
    const v = document.getElementById('bookPage').value;
    entry.bookPage = v === '' ? null : Number(v);
    saveState();
  });
}
bindStaticFieldListeners();

document.getElementById('saveGoals').addEventListener('click', () => {
  const entry = getOrCreateEntry(state.currentUser, todayStr());
  if (entry.goalsCreatedAt) return;
  const missing = entry.goals.some(g => !g.title.trim());
  if (missing && !confirm('Some of the 5 goal slots are empty. Save anyway?')) return;
  entry.goalsCreatedAt = Date.now();
  entry.dq = new Date() > deadlineFor(entry.date);
  saveState();
  renderToday();
});

document.getElementById('submitDay').addEventListener('click', () => {
  const entry = getOrCreateEntry(state.currentUser, todayStr());
  if (!entry.goalsCreatedAt) {
    entry.goalsCreatedAt = Date.now();
    entry.dq = new Date() > deadlineFor(entry.date);
  }
  entry.lessonLearned = document.getElementById('lessonLearned').value;
  entry.tomorrowFocus = document.getElementById('tomorrowFocus').value;
  entry.affirmation = document.getElementById('affirmation').value;
  const bp = document.getElementById('bookPage').value;
  entry.bookPage = bp === '' ? null : Number(bp);
  entry.submittedAt = Date.now();
  saveState();
  renderToday();
});

/* ===================== LEADERBOARD view ===================== */

function statusPill(status) {
  const label = status === 'dq' ? 'DQ' : status.toUpperCase();
  return `<span class="status-pill ${status}">${label}</span>`;
}

function renderLeaderboard() {
  const dstr = todayStr();
  const rows = Object.keys(ROSTER).map(key => {
    const e = findEntry(key, dstr);
    if (!e || !e.submittedAt) return { key, name: ROSTER[key].name, pct: -1, status: null, submitted: false, submittedAt: null };
    const { pct, status } = scoreOf(e);
    return { key, name: ROSTER[key].name, pct, status, submitted: true, submittedAt: e.submittedAt };
  }).sort((a, b) => b.pct - a.pct);

  const topPct = rows.reduce((m, r) => (r.submitted && r.status !== 'dq') ? Math.max(m, r.pct) : m, -1);
  let html = '<thead><tr><th>Name</th><th>Score</th><th>Status</th><th>Submitted at</th></tr></thead><tbody>';
  rows.forEach(r => {
    html += `<tr class="${r.submitted && r.status !== 'dq' && r.pct === topPct && topPct > 0 ? 'top-row' : ''}">
      <td>${r.name}</td>
      <td>${r.submitted ? r.pct + '%' : '—'}</td>
      <td>${r.submitted ? statusPill(r.status) : 'not logged'}</td>
      <td>${prettyTime(r.submittedAt)}</td>
    </tr>`;
  });
  html += '</tbody>';
  document.getElementById('leaderboardTable').innerHTML = html;
}

/* ===================== WEEK view ===================== */

function renderWeek() {
  const user = state.currentUser;
  const dates = lastNDates(7).reverse();
  let sum = 0, counted = 0;
  let html = '<thead><tr><th>Date</th><th>Type</th><th>Score</th><th>Status</th><th>Submitted at</th></tr></thead><tbody>';
  dates.forEach(d => {
    const e = findEntry(user, d);
    if (e && e.submittedAt) {
      const { pct, status } = scoreOf(e);
      sum += pct; counted++;
      html += `<tr><td>${prettyDate(d)}</td><td>${e.dayType}</td><td>${pct}%</td><td>${statusPill(status)}</td><td>${prettyTime(e.submittedAt)}</td></tr>`;
    } else {
      html += `<tr><td>${prettyDate(d)}</td><td>${dayTypeOf(d)}</td><td>—</td><td>${d === todayStr() ? 'pending' : 'no log'}</td><td>—</td></tr>`;
    }
  });
  html += '</tbody>';
  document.getElementById('weekTable').innerHTML = html;

  const avg = counted ? Math.round(sum / 7) : 0; // days with no log count as 0 toward the week
  const summary = document.getElementById('weekSummary');
  summary.innerHTML = `
    <div class="week-stat"><div class="week-stat-label">7-day average</div><div class="week-stat-val ${avg >= WEEKLY_TARGET ? 'ok' : 'bad'}">${avg}%</div></div>
    <div class="week-stat"><div class="week-stat-label">Target</div><div class="week-stat-val">${WEEKLY_TARGET}%</div></div>
    <div class="week-stat"><div class="week-stat-label">Logged days</div><div class="week-stat-val">${counted}/7</div></div>
  `;
}

/* ===================== BOOK view ===================== */

function latestBookEntry(user) {
  const entries = state.entries.filter(e => e.user === user && e.bookPage != null).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  return entries[0] || null;
}
function bookRowsHtml() {
  const now = Date.now();
  let html = '<thead><tr><th>Name</th><th>Page</th><th>vs. benchmark (60)</th><th>Last updated</th><th>Flag</th></tr></thead><tbody>';
  Object.keys(ROSTER).forEach(key => {
    const e = latestBookEntry(key);
    const page = e ? e.bookPage : 0;
    const diff = page - BOOK_BENCHMARK;
    const stale = e ? (now - (e.submittedAt || 0)) > 48 * 3600 * 1000 : true;
    html += `<tr>
      <td>${ROSTER[key].name}</td>
      <td>${e ? page : '—'}</td>
      <td class="${diff >= 0 ? '' : ''}">${e ? (diff >= 0 ? '+' + diff : diff) : '—'}</td>
      <td>${e ? prettyDate(e.date) : '—'}</td>
      <td>${stale ? '<span class="status-pill fail">48h+ stale</span>' : ''}</td>
    </tr>`;
  });
  html += '</tbody>';
  return html;
}
function renderBook() { document.getElementById('bookTable').innerHTML = bookRowsHtml(); }

/* ===================== RULES view ===================== */

function renderRules() {
  document.getElementById('rulesDoc').innerHTML = `
    <p class="rules-eff">Effective start: Wednesday, August 4 — 5:00 AM. Aug 3 was prep only.</p>
    <h2>Purpose</h2>
    <p>Accountability partners help each other execute, stay disciplined, and complete what they commit to every day. Your job isn't just to track your partner's progress — it's to help them succeed.</p>

    <h2>Daily goal format</h2>
    <h3>1. Header</h3>
    <p>First name, last name, date &amp; time.</p>
    <h3>2. Lesson learned</h3>
    <p>1–3 sentences on the biggest lesson, realization, or takeaway from the day.</p>
    <h3>3. Daily goals — 5 goals (new standard, down from 10)</h3>
    <ul>
      <li>Goals must be genuine <strong>needle-movers</strong>, not small tasks.</li>
      <li>If a goal naturally has multiple related actions (e.g. fitness, book reading), bundle them into <strong>ONE goal</strong> — up to <strong>5 sub-items</strong>.</li>
      <li><strong>All-or-nothing per goal:</strong> if any one sub-item under a goal isn't completed, the entire goal is marked incomplete.</li>
      <li>No inflating your list — don't break one task into several to pad your numbers.</li>
    </ul>
    <h3>4. Tomorrow's focus</h3>
    <p>1–2 sentences on your single highest priority and why.</p>
    <h3>5. Daily affirmation</h3>
    <p>One line reinforcing your mindset and commitment.</p>

    <h2>Weekday vs. weekend rules</h2>
    <p><strong>Weekdays:</strong> goals must follow the bundled needle-mover structure above.</p>
    <p><strong>Weekends:</strong> tasks are allowed to count as your 5 items (looser standard).</p>
    <ul>
      <li>Must be written down the night before — no writing tasks the same day and claiming completion.</li>
      <li>Goals still count toward the week; no exceptions for "it's the weekend."</li>
    </ul>

    <h2>Scoring</h2>
    <p>With 5 goals, each goal = 20%:</p>
    <table><tr><th>Completed</th><th>Score</th></tr>
      <tr><td>5/5</td><td>100%</td></tr><tr><td>4/5</td><td>80%</td></tr>
      <tr><td>3/5</td><td>60%</td></tr><tr><td>2/5</td><td>40%</td></tr><tr><td>1/5</td><td>20%</td></tr>
    </table>
    <ul>
      <li><strong>Miss 1 goal → capped at 80%.</strong></li>
      <li><strong>Miss 2 goals → automatic fail for the day</strong>, regardless of percentage.</li>
      <li><strong>Anything below 60% is a failing day.</strong></li>
    </ul>

    <h2>Quality standard</h2>
    <p><strong>Do:</strong> write goals that move the business, your role, or personal development forward; prioritize high-impact work; track completion honestly; challenge yourself while staying realistic.</p>
    <p><strong>Don't:</strong> fill your list with small/meaningless tasks to inflate completion %; break one task into several tiny ones; count busy work that isn't meaningful progress; falsify or exaggerate completed goals.</p>
    <p><strong>Impact &gt; activity, always.</strong></p>

    <h2>Accountability partner responsibilities</h2>
    <ul>
      <li>Check in <strong>morning</strong> to review goals and priorities.</li>
      <li>Check in <strong>midday</strong> to confirm pace and remove obstacles.</li>
      <li>Check in <strong>end of day</strong> to review completion, discuss improvements, and prep tomorrow.</li>
      <li>Don't wait for the leadership meeting to discover your partner fell behind — reach out early.</li>
    </ul>

    <h2>Winning the day — team standard</h2>
    <p>Both standards must be met:</p>
    <ul>
      <li><strong>Individual:</strong> score at least 60% (no more than 1 missed goal).</li>
      <li><strong>Team:</strong> combined completion must reach <strong>80%</strong>.</li>
    </ul>
    <p>One partner cannot carry the team — both must contribute.</p>

    <h2>Weekly standard</h2>
    <p>Complete at least <strong>70%</strong> of your goals by end of week. Daily discipline creates weekly success.</p>

    <h2>Book reading requirement</h2>
    <ul>
      <li>Continue tracking pages read same as before.</li>
      <li>Current benchmark: <strong>page 60</strong>.</li>
      <li>Take notes on every page — comprehension is the goal, not just page count.</li>
      <li>Anyone behind gets one grace day to catch up before being held to the standard track.</li>
    </ul>

    <h2>Deadline / disqualification</h2>
    <ul>
      <li><strong>5:00 AM</strong> submission deadline — every day, including weekends.</li>
      <li><strong>Auto-DQ if goals are filled out after 5:00 AM.</strong></li>
    </ul>

    <h2>Core principles</h2>
    <ul>
      <li>Be honest with your numbers.</li>
      <li>Communicate early if you're falling behind.</li>
      <li>Ask for help before it's too late.</li>
      <li>Push your partner to become better.</li>
      <li>Hold each other accountable.</li>
      <li>Solve problems instead of making excuses.</li>
      <li>Execute what you committed to.</li>
    </ul>
    <hr/>
  `;
}

/* ===================== ADMIN view ===================== */

function renderAdmin() {
  if (!ROSTER[state.currentUser].admin) { switchView('today'); return; }
  const dstr = todayStr();

  // pairing
  let pairsHtml = '';
  PAIRS.forEach(([a, b]) => {
    const ea = findEntry(a, dstr), eb = findEntry(b, dstr);
    const ca = ea && ea.submittedAt ? completedCount(ea) : 0;
    const cb = eb && eb.submittedAt ? completedCount(eb) : 0;
    const teamPct = Math.round(((ca + cb) / 10) * 100);
    const aOk = ea && ea.submittedAt && !effectiveDq(ea) && ca >= 3;
    const bOk = eb && eb.submittedAt && !effectiveDq(eb) && cb >= 3;
    const win = teamPct >= 80 && aOk && bOk;
    pairsHtml += `<div class="pair-summary"><span>${ROSTER[a].name} + ${ROSTER[b].name}</span><span>${teamPct}% — ${win ? 'WIN THE DAY' : 'not yet'}</span></div>`;
  });
  document.getElementById('adminPairs').innerHTML = pairsHtml;

  // weekly rollup
  const dates7 = lastNDates(7);
  let weeklyHtml = '';
  Object.keys(ROSTER).forEach(key => {
    let sum = 0;
    dates7.forEach(d => { const e = findEntry(key, d); if (e && e.submittedAt) sum += scoreOf(e).pct; });
    const avg = Math.round(sum / 7);
    weeklyHtml += `<div class="pair-summary"><span>${ROSTER[key].name}</span><span class="${avg >= WEEKLY_TARGET ? '' : ''}">${avg}%</span></div>`;
  });
  document.getElementById('adminWeekly').innerHTML = weeklyHtml;

  // daily leaderboard (all statuses incl not logged)
  let dailyHtml = '<thead><tr><th>Name</th><th>Score</th><th>Status</th><th>Goals saved at</th><th>Submitted at</th></tr></thead><tbody>';
  Object.keys(ROSTER).forEach(key => {
    const e = findEntry(key, dstr);
    if (!e || !e.submittedAt) {
      dailyHtml += `<tr><td>${ROSTER[key].name}</td><td>—</td><td>not logged</td><td>${e && e.goalsCreatedAt ? prettyTime(e.goalsCreatedAt) : '—'}</td><td>—</td></tr>`;
    } else {
      const { pct, status } = scoreOf(e);
      dailyHtml += `<tr><td>${ROSTER[key].name}</td><td>${pct}%</td><td>${statusPill(status)}</td><td>${prettyTime(e.goalsCreatedAt)}</td><td>${prettyTime(e.submittedAt)}</td></tr>`;
    }
  });
  dailyHtml += '</tbody>';
  document.getElementById('adminDaily').innerHTML = dailyHtml;

  // DQ log
  const dqEntries = state.entries.filter(e => effectiveDq(e)).sort((a, b) => b.date.localeCompare(a.date));
  let dqHtml = '<thead><tr><th>Name</th><th>Date</th><th>Goals saved at</th></tr></thead><tbody>';
  dqEntries.forEach(e => {
    dqHtml += `<tr><td>${ROSTER[e.user].name}</td><td>${prettyDate(e.date)}</td><td>${e.goalsCreatedAt ? new Date(e.goalsCreatedAt).toLocaleTimeString() : '—'}</td></tr>`;
  });
  dqHtml += '</tbody>';
  document.getElementById('adminDQ').innerHTML = dqHtml || '';
  if (!dqEntries.length) document.getElementById('adminDQ').innerHTML = '<tbody><tr><td>No disqualifications logged.</td></tr></tbody>';

  document.getElementById('adminBook').innerHTML = bookRowsHtml();

  renderPrizeLog();
  renderLegacy();
}

function renderPrizeLog() {
  let html = '<thead><tr><th>Winner</th><th>Amount</th><th>Date</th><th>Note</th></tr></thead><tbody>';
  state.prizeLog.slice().reverse().forEach(p => {
    html += `<tr><td>${p.winner}</td><td>${p.amount}</td><td>${p.date}</td><td>${p.note || ''}</td></tr>`;
  });
  html += '</tbody>';
  document.getElementById('adminPrizes').innerHTML = html;
}
document.getElementById('prizeForm').addEventListener('submit', e => {
  e.preventDefault();
  const winner = document.getElementById('prizeWinner').value.trim();
  const amount = document.getElementById('prizeAmount').value.trim() || '$100';
  const date = document.getElementById('prizeDate').value || todayStr();
  const note = document.getElementById('prizeNote').value.trim();
  if (!winner) return;
  state.prizeLog.push({ winner, amount, date, note });
  saveState();
  e.target.reset();
  renderPrizeLog();
});

function renderLegacy() {
  const legacy = state.entries.filter(e => e.legacy);
  let html = '<thead><tr><th>Name</th><th>Date</th><th>Note</th></tr></thead><tbody>';
  legacy.forEach(e => { html += `<tr><td>${ROSTER[e.user] ? ROSTER[e.user].name : e.user}</td><td>${e.date}</td><td>legacy / 10-goal scoring</td></tr>`; });
  html += '</tbody>';
  document.getElementById('adminLegacy').innerHTML = html;
}
document.getElementById('legacyImportBtn').addEventListener('click', () => {
  const raw = document.getElementById('legacyImport').value.trim();
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    arr.forEach(item => { item.legacy = true; item.id = item.id || `legacy_${item.user}_${item.date}_${Math.random().toString(36).slice(2)}`; state.entries.push(item); });
    saveState();
    document.getElementById('legacyImport').value = '';
    renderLegacy();
  } catch (err) { alert('Could not parse that as JSON.'); }
});

/* ===================== boot ===================== */

tickClock();
if (state.currentUser && ROSTER[state.currentUser]) enterApp();
else renderGate();
