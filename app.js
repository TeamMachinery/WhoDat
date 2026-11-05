'use strict';

/* =========================================================
   Ljudi — osobni imenik ljudi koje upoznaješ
   Podaci se čuvaju lokalno na uređaju (IndexedDB).
   ========================================================= */

const MET = 'met';
const DEFAULT_SECTIONS = [
  { id: 'likes', name: 'Voli' },
  { id: 'dislikes', name: 'Ne voli' },
  { id: MET, name: 'Upoznali smo se' },
];

const $app = document.getElementById('app');
const collator = new Intl.Collator('hr', { sensitivity: 'base' });

let db;
let people = [];
let sections = [];
let searchQuery = '';
let listScroll = 0;
let currentView = '';
let currentId = null;
let pendingPhoto = null; // {full, thumb} | 'remove' | null

/* ---------------- Ikone ---------------- */
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  right: svg('<path d="m9 6 6 6-6 6"/>'),
  left: svg('<path d="m15 5-7 7 7 7"/>'),
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  cake: svg('<path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0M12 12V8.5M12 6c.9-.9.9-1.9 0-3-.9 1.1-.9 2.1 0 3z"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  upload: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
};

/* ---------------- Pomoćne funkcije ---------------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
const fullName = (p) => [p.firstName, p.lastName].filter(Boolean).join(' ');
const sectionById = (id) => sections.find((s) => s.id === id);

function sortPeople(list) {
  return [...list].sort((a, b) =>
    collator.compare(a.firstName || '', b.firstName || '') ||
    collator.compare(a.lastName || '', b.lastName || ''));
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}. ${y}.`;
}

function age(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a >= 0 && a < 130 ? a : null;
}

function isBirthdayToday(iso) {
  if (!iso) return false;
  const [, m, d] = iso.split('-').map(Number);
  const now = new Date();
  return now.getMonth() + 1 === m && now.getDate() === d;
}

function godina(n) {
  const l10 = n % 10, l100 = n % 100;
  if (l10 === 1 && l100 !== 11) return 'godina';
  if (l10 >= 2 && l10 <= 4 && (l100 < 12 || l100 > 14)) return 'godine';
  return 'godina';
}

function osoba(n) {
  const l10 = n % 10, l100 = n % 100;
  if (l10 === 1 && l100 !== 11) return 'osoba';
  if (l10 >= 2 && l10 <= 4 && (l100 < 12 || l100 > 14)) return 'osobe';
  return 'osoba';
}

const AVATAR_COLORS = ['#8a5cff', '#ff5ca8', '#ff8a3d', '#2fb5a3', '#3d8bff', '#e0559a', '#7a6cf0', '#38a169'];
function avatar(p, size) {
  if (p.thumb) return `<img class="avatar avatar-${size}" src="${p.thumb}" alt="">`;
  if (!p.firstName) return `<div class="avatar avatar-${size} placeholder">${ICON.camera}</div>`;
  const initials = (((p.firstName || '?')[0]) + ((p.lastName || '')[0] || '')).toLocaleUpperCase('hr');
  let h = 0;
  for (const ch of p.id || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<div class="avatar avatar-${size}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc(initials)}</div>`;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------------- Baza (IndexedDB) ---------------- */
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('ljudi-db', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('people', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function run(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    const req = fn(s);
    let result;
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const dbAll = (s) => run(s, 'readonly', (st) => st.getAll());
const dbGet = (s, k) => run(s, 'readonly', (st) => st.get(k));
const dbPut = (s, v) => run(s, 'readwrite', (st) => st.put(v));
const dbDel = (s, k) => run(s, 'readwrite', (st) => st.delete(k));
const dbClear = (s) => run(s, 'readwrite', (st) => st.clear());

const saveSections = () => dbPut('meta', { key: 'sections', value: sections });
async function savePerson(p) {
  p.updatedAt = Date.now();
  await dbPut('people', p);
  const i = people.findIndex((x) => x.id === p.id);
  if (i >= 0) people[i] = p; else people.push(p);
}

/* ---------------- Slike ---------------- */
async function processPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { full: drawScaled(img, 1400, false, 0.85), thumb: drawScaled(img, 240, true, 0.82) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(img, max, square, quality) {
  const w = img.naturalWidth, h = img.naturalHeight;
  let sx = 0, sy = 0, sw = w, sh = h;
  if (square) {
    const s = Math.min(w, h);
    sx = (w - s) / 2;
    sy = (h - s) * 0.3; // portreti: lice je obično u gornjem dijelu
    sw = sh = s;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/* ---------------- Router ---------------- */
function go(hash, replace = false) {
  if (replace) location.replace(hash); else location.hash = hash;
}

function route() {
  if (currentView === 'list') listScroll = window.scrollY;
  closeSheet(true);
  closeViewer();
  const parts = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  const [view, id] = parts;
  if (view === 'p' && id) return renderProfile(decodeURIComponent(id));
  if (view === 'edit' && id) return renderEdit(decodeURIComponent(id));
  if (view === 'new') return renderEdit(null);
  if (view === 'settings') return renderSettings();
  renderList();
}

/* ---------------- Lista ljudi ---------------- */
function renderList() {
  currentView = 'list';
  currentId = null;
  $app.innerHTML = `
    <header class="topbar">
      <a class="icon-btn" href="#/settings" aria-label="Postavke">${ICON.settings}</a>
      <div></div>
      <a class="icon-btn filled" href="#/new" aria-label="Dodaj osobu">${ICON.plus}</a>
    </header>
    <h1 class="large-title">Ljudi</h1>
    ${people.length ? `
    <label class="search">
      ${ICON.search}
      <input id="q" type="search" enterkeyhint="search" placeholder="Ime ili gdje ste se upoznali" value="${esc(searchQuery)}" autocomplete="off" autocorrect="off" spellcheck="false">
      <button class="clear" data-action="clear-search" aria-label="Obriši pretragu" ${searchQuery ? '' : 'hidden'}>${ICON.x}</button>
    </label>` : ''}
    <div id="list"></div>`;
  renderListBody();
  const q = document.getElementById('q');
  if (q) {
    q.addEventListener('input', () => {
      searchQuery = q.value;
      $app.querySelector('.clear').hidden = !searchQuery;
      renderListBody();
    });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') q.blur(); });
  }
  window.scrollTo(0, listScroll);
}

function matchPerson(p, qn) {
  if (!qn) return { ok: true };
  const name = norm(fullName(p));
  const words = qn.split(/\s+/).filter(Boolean);
  if (words.every((w) => name.includes(w))) return { ok: true };
  const hit = (p.items?.[MET] || []).find((i) => norm(i.text).includes(qn));
  if (hit) return { ok: true, met: hit.text };
  return { ok: false };
}

function highlight(text, qn) {
  // Pronađi poziciju u originalnom tekstu (norm ne mijenja duljinu za hr. znakove)
  const n = norm(text);
  const i = n.indexOf(qn);
  if (i < 0 || n.length !== text.length) return esc(text);
  const start = Math.max(0, i - 12);
  return (start > 0 ? '…' : '') + esc(text.slice(start, i)) + '<mark>' + esc(text.slice(i, i + qn.length)) + '</mark>' + esc(text.slice(i + qn.length));
}

function renderListBody() {
  const el = document.getElementById('list');
  if (!people.length) {
    el.innerHTML = `
      <div class="welcome">
        <div class="big">👋</div>
        <h2>Još nema nikoga</h2>
        <p>Dodaj prvu osobu koju si upoznala i zapisuj što saznaješ o njoj.</p>
        <a class="wide-btn" href="#/new">${ICON.plus} Dodaj osobu</a>
      </div>`;
    return;
  }
  const qn = norm(searchQuery.trim());
  const rows = [];
  for (const p of sortPeople(people)) {
    const m = matchPerson(p, qn);
    if (m.ok) rows.push({ p, met: m.met });
  }
  if (!rows.length) {
    el.innerHTML = `<p class="count">Nitko ne odgovara pretrazi „${esc(searchQuery.trim())}”.</p>`;
    return;
  }
  const row = ({ p, met }) => {
    const sub = met
      ? highlight(met, qn)
      : esc(p.location || '');
    return `<a class="row" href="#/p/${encodeURIComponent(p.id)}">
      ${avatar(p, 46)}
      <div class="row-text"><div class="row-name">${esc(fullName(p))}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>
      ${ICON.right}
    </a>`;
  };
  let html = '';
  if (qn) {
    html = `<div class="group">${rows.map(row).join('')}</div>`;
  } else {
    let letter = null;
    let buf = [];
    const flush = () => { if (buf.length) html += `<div class="letter">${esc(letter)}</div><div class="group">${buf.join('')}</div>`; buf = []; };
    for (const r of rows) {
      const l = (r.p.firstName || '#').charAt(0).toLocaleUpperCase('hr');
      if (l !== letter) { flush(); letter = l; }
      buf.push(row(r));
    }
    flush();
  }
  const n = rows.length;
  html += `<p class="count">${n} ${osoba(n)}</p>`;
  el.innerHTML = html;
}

/* ---------------- Profil ---------------- */
function renderProfile(id) {
  const p = people.find((x) => x.id === id);
  if (!p) return go('#/', true);
  currentView = 'profile';
  currentId = id;
  const a = age(p.birthDate);
  const bday = isBirthdayToday(p.birthDate);
  $app.innerHTML = `
    <header class="topbar">
      <a class="text-btn" href="#/">${ICON.left}Ljudi</a>
      <div></div>
      <a class="text-btn" href="#/edit/${encodeURIComponent(p.id)}">Uredi</a>
    </header>
    <section class="profile-head">
      <button class="avatar-btn" data-action="view-photo" aria-label="Prikaži sliku">${avatar(p, 88)}</button>
      <div class="profile-info">
        <h1>${esc(fullName(p))}</h1>
        ${p.birthDate ? `<div class="meta">${ICON.cake}<span>${formatDate(p.birthDate)}${a !== null ? ` · ${a} ${godina(a)}` : ''}${bday ? ' · 🎉 rođendan je danas!' : ''}</span></div>` : ''}
        ${p.location ? `<div class="meta">${ICON.pin}<span>${esc(p.location)}</span></div>` : ''}
      </div>
    </section>
    ${sections.map((s) => sectionCard(p, s)).join('')}
    <button class="wide-btn" data-action="add-section">${ICON.plus} Nova sekcija</button>
    <p class="hint">Nova sekcija pojavit će se na profilu svake osobe. Sekcije možeš preimenovati i presložiti u postavkama.</p>`;
  window.scrollTo(0, 0);
}

function sectionCard(p, s) {
  const items = p.items?.[s.id] || [];
  return `
    <section class="card">
      <div class="card-head">
        <h2>${esc(s.name)}</h2>
        <button class="icon-btn" data-action="add-item" data-sec="${esc(s.id)}" aria-label="Dodaj u ${esc(s.name)}">${ICON.plus}</button>
      </div>
      ${items.length
        ? `<ul class="bullets">${items.map((i) => `<li data-action="edit-item" data-sec="${esc(s.id)}" data-item="${esc(i.id)}">${esc(i.text)}</li>`).join('')}</ul>`
        : `<p class="empty">Još ništa zapisano.</p>`}
    </section>`;
}

/* ---------------- Uređivanje osobe ---------------- */
function renderEdit(id) {
  const p = id ? people.find((x) => x.id === id) : null;
  if (id && !p) return go('#/', true);
  currentView = 'edit';
  currentId = id;
  pendingPhoto = null;
  const cancel = p ? `#/p/${encodeURIComponent(p.id)}` : '#/';
  const draft = p || { id: 'new', firstName: '', lastName: '' };
  $app.innerHTML = `
    <header class="topbar">
      <a class="text-btn" href="${cancel}">Odustani</a>
      <div class="topbar-title">${p ? 'Uredi' : 'Nova osoba'}</div>
      <button class="text-btn bold" data-action="save-person">Spremi</button>
    </header>
    <div class="edit-photo">
      <label for="photo-input" id="photo-preview" style="cursor:pointer">${avatar(draft, 110)}</label>
      <div class="links">
        <label class="link" for="photo-input">${p?.thumb ? 'Promijeni sliku' : 'Dodaj sliku'}</label>
        <button class="link danger" data-action="remove-photo" ${p?.thumb ? '' : 'hidden'}>Ukloni</button>
      </div>
      <input id="photo-input" type="file" accept="image/*" hidden>
    </div>
    <div class="form-group">
      <label class="field"><span>Ime</span><input id="f-first" value="${esc(p?.firstName)}" placeholder="obavezno" autocapitalize="words" autocomplete="off"></label>
      <label class="field"><span>Prezime</span><input id="f-last" value="${esc(p?.lastName)}" autocapitalize="words" autocomplete="off"></label>
      <label class="field"><span>Datum rođenja</span><input id="f-birth" type="date" value="${esc(p?.birthDate)}"></label>
      <label class="field"><span>Živi u</span><input id="f-loc" value="${esc(p?.location)}" placeholder="grad, država" autocapitalize="words" autocomplete="off"></label>
    </div>
    ${p ? '' : `
    <div class="form-group">
      <label class="field stack"><span>${esc(sectionById(MET)?.name || 'Upoznali smo se')}</span>
        <textarea id="f-met" placeholder="Gdje i kako ste se upoznali?"></textarea>
      </label>
    </div>`}
    ${p ? `<button class="wide-btn danger" data-action="delete-person">${ICON.trash} Obriši osobu</button>` : ''}`;

  document.getElementById('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      pendingPhoto = await processPhoto(file);
      document.getElementById('photo-preview').innerHTML = avatar({ ...draft, thumb: pendingPhoto.thumb }, 110);
      $app.querySelector('[data-action="remove-photo"]').hidden = false;
    } catch (err) {
      console.error(err);
      toast('Ne mogu učitati tu sliku.');
    }
  });
  window.scrollTo(0, 0);
  if (!p) document.getElementById('f-first').focus();
}

async function savePersonFromForm() {
  const val = (id) => document.getElementById(id)?.value.trim() || '';
  const firstName = val('f-first');
  if (!firstName) {
    toast('Upiši barem ime.');
    document.getElementById('f-first').focus();
    return;
  }
  const existing = currentId ? people.find((x) => x.id === currentId) : null;
  const p = existing ? { ...existing } : { id: uid(), items: {}, createdAt: Date.now() };
  p.firstName = firstName;
  p.lastName = val('f-last');
  p.birthDate = val('f-birth');
  p.location = val('f-loc');
  const met = val('f-met');
  if (met) p.items = { ...p.items, [MET]: [...(p.items[MET] || []), { id: uid(), text: met }] };

  if (pendingPhoto === 'remove') {
    await dbDel('photos', p.id);
    p.thumb = null;
  } else if (pendingPhoto) {
    await dbPut('photos', { id: p.id, data: pendingPhoto.full });
    p.thumb = pendingPhoto.thumb;
  }
  await savePerson(p);
  pendingPhoto = null;
  go(`#/p/${encodeURIComponent(p.id)}`, true);
}

async function deletePerson() {
  const p = people.find((x) => x.id === currentId);
  if (!p) return;
  if (!(await askConfirm(`Obrisati osobu ${fullName(p)}?`, 'Obrisat će se i sve što je zapisano o toj osobi. Ovo se ne može poništiti.', 'Obriši'))) return;
  await dbDel('people', p.id);
  await dbDel('photos', p.id);
  people = people.filter((x) => x.id !== p.id);
  go('#/', true);
  toast('Osoba obrisana.');
}

/* ---------------- Postavke ---------------- */
function renderSettings() {
  currentView = 'settings';
  currentId = null;
  $app.innerHTML = `
    <header class="topbar">
      <a class="text-btn" href="#/">${ICON.left}Ljudi</a>
      <div class="topbar-title">Postavke</div>
      <div></div>
    </header>
    <h2 class="group-title">Sekcije</h2>
    <div class="form-group" style="margin-bottom:0">
      ${sections.map((s, i) => `
        <div class="srow">
          <div class="sname">${esc(s.name)}${s.id === MET ? '<small>koristi se u pretrazi</small>' : ''}</div>
          <button class="icon-btn" data-action="sec-up" data-sec="${esc(s.id)}" aria-label="Pomakni gore" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon-btn" data-action="sec-down" data-sec="${esc(s.id)}" aria-label="Pomakni dolje" ${i === sections.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
          <button class="icon-btn" data-action="sec-rename" data-sec="${esc(s.id)}" aria-label="Preimenuj">${ICON.pencil}</button>
          <button class="icon-btn danger" data-action="sec-delete" data-sec="${esc(s.id)}" aria-label="Obriši" ${s.id === MET ? 'disabled' : ''}>${ICON.trash}</button>
        </div>`).join('')}
      <button class="btn-row" data-action="add-section">${ICON.plus} Nova sekcija</button>
    </div>
    <p class="hint">Sekcije se prikazuju na svakom profilu ovim redoslijedom.</p>

    <h2 class="group-title">Sigurnosna kopija</h2>
    <div class="form-group" style="margin-bottom:0">
      <button class="btn-row" data-action="export">${ICON.download} Izvezi sve podatke</button>
      <label class="btn-row">${ICON.upload} Uvezi iz kopije<input id="import-input" type="file" accept="application/json,.json" hidden></label>
    </div>
    <p class="hint">Podaci se čuvaju samo na ovom uređaju. Povremeno izvezi kopiju i spremi je u Datoteke ili iCloud Drive — ako obrišeš aplikaciju, podaci nestaju.</p>
    <p class="count">${people.length} ${osoba(people.length)} · ${sections.length} ${sections.length % 10 >= 2 && sections.length % 10 <= 4 && (sections.length % 100 < 12 || sections.length % 100 > 14) ? 'sekcije' : 'sekcija'}</p>`;
  document.getElementById('import-input').addEventListener('change', importData);
  window.scrollTo(0, 0);
}

function moveSection(id, dir) {
  const i = sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sections.length) return;
  [sections[i], sections[j]] = [sections[j], sections[i]];
  saveSections();
  renderSettings();
}

async function deleteSection(id) {
  const s = sectionById(id);
  if (!s || id === MET) return;
  const used = people.filter((p) => (p.items?.[id] || []).length).length;
  const msg = used
    ? `Obrisati sekciju „${s.name}”? Zapisi u njoj bit će obrisani na ${used} ${used === 1 ? 'profilu' : 'profila'}.`
    : `Obrisati sekciju „${s.name}”?`;
  if (!(await askConfirm('Obrisati sekciju?', msg, 'Obriši'))) return;
  sections = sections.filter((x) => x.id !== id);
  await saveSections();
  for (const p of people) {
    if (p.items?.[id]) {
      const copy = { ...p, items: { ...p.items } };
      delete copy.items[id];
      await savePerson(copy);
    }
  }
  renderSettings();
}

function addSection() {
  openSheet({
    title: 'Nova sekcija',
    multiline: false,
    placeholder: 'npr. Gdje je sve bio/la',
    hint: 'Sekcija će se pojaviti na profilima svih osoba.',
    saveLabel: 'Dodaj',
    onSave: async (name) => {
      if (sections.some((s) => norm(s.name) === norm(name))) { toast('Ta sekcija već postoji.'); return false; }
      sections.push({ id: uid(), name });
      await saveSections();
      route();
    },
  });
}

/* ---------------- Sigurnosna kopija ---------------- */
async function exportData() {
  const photos = await dbAll('photos');
  const data = { app: 'ljudi', version: 1, exportedAt: new Date().toISOString(), sections, people, photos };
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const name = `ljudi-kopija-${stamp}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function importData(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (data.app !== 'ljudi' || !Array.isArray(data.people) || !Array.isArray(data.sections)) throw new Error('format');
  } catch {
    toast('To nije ispravna kopija.');
    return;
  }
  if (!(await askConfirm('Uvesti kopiju?', `Uvest će se ${data.people.length} ${osoba(data.people.length)}. Svi trenutni podaci na ovom uređaju bit će zamijenjeni.`, 'Uvezi', false))) return;
  await dbClear('people');
  await dbClear('photos');
  await run('people', 'readwrite', (st) => { data.people.forEach((p) => st.put(p)); });
  await run('photos', 'readwrite', (st) => { (data.photos || []).forEach((ph) => st.put(ph)); });
  sections = data.sections;
  if (!sectionById(MET)) sections.push(DEFAULT_SECTIONS[2]);
  await saveSections();
  people = await dbAll('people');
  toast('Podaci uvezeni.');
  renderSettings();
}

/* ---------------- Sheet (unos teksta) ---------------- */
const sheetRoot = document.getElementById('sheet-root');
let sheetCleanup = null;

function openSheet({ title, value = '', placeholder = '', multiline = true, hint = '', saveLabel = 'Spremi', onSave, onDelete }) {
  sheetRoot.innerHTML = `
    <div class="backdrop" data-s="cancel"></div>
    <div class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="sheet-head">
        <button class="text-btn" data-s="cancel">Odustani</button>
        <div class="sheet-title">${esc(title)}</div>
        <button class="text-btn bold" data-s="save">${esc(saveLabel)}</button>
      </div>
      ${multiline
        ? `<textarea id="sheet-field" placeholder="${esc(placeholder)}" autocapitalize="sentences">${esc(value)}</textarea>`
        : `<input id="sheet-field" placeholder="${esc(placeholder)}" value="${esc(value)}" autocapitalize="sentences" autocomplete="off" enterkeyhint="done">`}
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      ${onDelete ? `<button class="wide-btn danger" data-s="delete">${ICON.trash} Obriši</button>` : ''}
    </div>`;
  const field = document.getElementById('sheet-field');
  field.focus({ preventScroll: true }); // mora biti sinkrono da se na iPhoneu otvori tipkovnica
  if (!multiline) field.setSelectionRange(field.value.length, field.value.length);
  requestAnimationFrame(() => sheetRoot.classList.add('open'));

  let busy = false;
  const save = async () => {
    if (busy) return;
    const text = field.value.trim();
    if (!text) { field.focus(); return; }
    busy = true;
    const res = await onSave(text);
    busy = false;
    if (res !== false) closeSheet();
  };
  const onClick = async (e) => {
    const s = e.target.closest('[data-s]')?.dataset.s;
    if (s === 'cancel') closeSheet();
    else if (s === 'save') save();
    else if (s === 'delete') { if (await askConfirm('Obrisati ovu stavku?', '', 'Obriši')) { await onDelete(); closeSheet(); } }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closeSheet();
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  };
  sheetRoot.addEventListener('click', onClick);
  field.addEventListener('keydown', onKey);
  sheetCleanup = () => sheetRoot.removeEventListener('click', onClick);
}

function closeSheet(immediate = false) {
  if (!sheetRoot.innerHTML) return;
  sheetCleanup?.();
  sheetCleanup = null;
  document.activeElement?.blur?.();
  sheetRoot.classList.remove('open');
  if (immediate) { sheetRoot.innerHTML = ''; return; }
  setTimeout(() => { if (!sheetRoot.classList.contains('open')) sheetRoot.innerHTML = ''; }, 260);
}

/* ---------------- Potvrda (umjesto window.confirm, koji na iPhoneu
   u aplikaciji s početnog zaslona zna biti blokiran) ---------------- */
function askConfirm(title, message = '', okLabel = 'U redu', danger = true) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'dialog-root';
    root.innerHTML = `
      <div class="dialog" role="alertdialog" aria-label="${esc(title)}">
        <div class="dialog-body">
          <div class="dialog-title">${esc(title)}</div>
          ${message ? `<div class="dialog-msg">${esc(message)}</div>` : ''}
        </div>
        <div class="dialog-btns">
          <button data-c="no">Odustani</button>
          <button data-c="yes" class="${danger ? 'danger' : 'bold'}">${esc(okLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (!c && e.target !== root) return;
      root.remove();
      resolve(c === 'yes');
    });
  });
}

/* ---------------- Pregled velike slike ---------------- */
const viewerRoot = document.getElementById('viewer-root');
async function viewPhoto() {
  const p = people.find((x) => x.id === currentId);
  if (!p) return;
  if (!p.thumb) return go(`#/edit/${encodeURIComponent(p.id)}`);
  const ph = await dbGet('photos', p.id);
  viewerRoot.innerHTML = `
    <div class="viewer" data-v="close">
      <img src="${ph?.data || p.thumb}" alt="${esc(fullName(p))}">
      <button class="close" data-v="close" aria-label="Zatvori">${ICON.x}</button>
    </div>`;
}
function closeViewer() { viewerRoot.innerHTML = ''; }
viewerRoot.addEventListener('click', closeViewer);

/* ---------------- Akcije ---------------- */
const actions = {
  'clear-search': (el, e) => {
    e.preventDefault();
    searchQuery = '';
    const q = document.getElementById('q');
    q.value = '';
    el.hidden = true;
    renderListBody();
  },
  'view-photo': viewPhoto,
  'add-section': addSection,
  'add-item': (el) => {
    const s = sectionById(el.dataset.sec);
    const p = people.find((x) => x.id === currentId);
    if (!s || !p) return;
    openSheet({
      title: s.name,
      placeholder: 'Što si saznala?',
      hint: 'Svaki novi red postaje zasebna stavka.',
      saveLabel: 'Dodaj',
      onSave: async (text) => {
        const newItems = text.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ id: uid(), text: t, createdAt: Date.now() }));
        const copy = { ...p, items: { ...p.items, [s.id]: [...(p.items?.[s.id] || []), ...newItems] } };
        await savePerson(copy);
        renderProfile(p.id);
      },
    });
  },
  'edit-item': (el) => {
    const s = sectionById(el.dataset.sec);
    const p = people.find((x) => x.id === currentId);
    const item = p?.items?.[el.dataset.sec]?.find((i) => i.id === el.dataset.item);
    if (!s || !item) return;
    const update = async (fn) => {
      const copy = { ...p, items: { ...p.items, [s.id]: fn(p.items[s.id]) } };
      await savePerson(copy);
      renderProfile(p.id);
    };
    openSheet({
      title: s.name,
      value: item.text,
      onSave: (text) => update((list) => list.map((i) => (i.id === item.id ? { ...i, text } : i))),
      onDelete: () => update((list) => list.filter((i) => i.id !== item.id)),
    });
  },
  'save-person': savePersonFromForm,
  'remove-photo': (el) => {
    pendingPhoto = 'remove';
    const p = people.find((x) => x.id === currentId) || { id: 'new' };
    document.getElementById('photo-preview').innerHTML = avatar({ ...p, firstName: document.getElementById('f-first').value || p.firstName, lastName: document.getElementById('f-last').value || p.lastName, thumb: null }, 110);
    el.hidden = true;
  },
  'delete-person': deletePerson,
  'sec-up': (el) => moveSection(el.dataset.sec, -1),
  'sec-down': (el) => moveSection(el.dataset.sec, 1),
  'sec-rename': (el) => {
    const s = sectionById(el.dataset.sec);
    if (!s) return;
    openSheet({
      title: 'Preimenuj sekciju',
      value: s.name,
      multiline: false,
      onSave: async (name) => {
        s.name = name;
        await saveSections();
        renderSettings();
      },
    });
  },
  'sec-delete': (el) => deleteSection(el.dataset.sec),
  export: exportData,
};

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  actions[el.dataset.action]?.(el, e);
});

/* ---------------- Pokretanje ---------------- */
async function init() {
  try {
    db = await openDB();
    people = await dbAll('people');
    const meta = await dbGet('meta', 'sections');
    sections = meta?.value?.length ? meta.value : DEFAULT_SECTIONS.map((s) => ({ ...s }));
    if (!meta) await saveSections();
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<div class="welcome"><h2>Greška</h2><p>Ne mogu otvoriti lokalnu bazu podataka. Provjeri da nisi u privatnom načinu pregledavanja.</p></div>`;
    return;
  }
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', route);
  route();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
