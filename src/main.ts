import { LANGS, LANG_LABEL, SPEECH_LANG, T, fmtDist, type Lang } from './i18n';
import { searchPlaces, fetchIntro, QuotaError, type Place } from './api';

function $<E extends HTMLElement = HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as E;
}
const els = {
  title: $('title'), lang: $<HTMLSelectElement>('lang'), radiusLabel: $('radius-label'),
  radius: $<HTMLInputElement>('radius'), radiusOut: $('radius-out'), find: $<HTMLButtonElement>('find'),
  status: $('status'), list: $('list'), detail: $('detail'), dName: $('d-name'), dMeta: $('d-meta'), dText: $('d-text'),
  speak: $<HTMLButtonElement>('speak'), stop: $<HTMLButtonElement>('stop'),
  nav: $<HTMLAnchorElement>('nav'), src: $<HTMLAnchorElement>('src'), credits: $('credits'),
  note: $('d-note'), speedBox: $('speed-box'), speedLabel: $('speed-label'), speedOut: $('speed-out'),
  slower: $<HTMLButtonElement>('slower'), faster: $<HTMLButtonElement>('faster'),
};

function initialLang(): Lang {
  try {
    const s = localStorage.getItem('lang');
    if (s && (LANGS as string[]).includes(s)) return s as Lang;
  } catch { /* storage unavailable */ }
  const n = navigator.language.toLowerCase();
  if (!n.startsWith('zh')) return 'en';
  return /cn|hans|sg/.test(n) ? 'zh-CN' : 'zh-TW';
}

let lang: Lang = initialLang();
let places: Place[] = [];
let selected: Place | null = null;
let narration = '';
let detailId = 0;
let statusFn: () => string = () => '';
const hasSpeech = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const t = () => T[lang];
const placeName = (p: Place) => (lang === 'en' ? p.names.en : lang === 'zh-CN' ? p.names.cn : p.names.tw);
const setStatus = (fn: () => string) => { statusFn = fn; els.status.textContent = fn(); };

function stopSpeak() { if (hasSpeech) speechSynthesis.cancel(); }
const SPEEDS = [1, 1.5, 2, 3, 4, 5];
let speedIdx = 0;
let parts: string[] = [];
let cur = 0;
try {
  const i = SPEEDS.indexOf(Number(localStorage.getItem('speed')));
  if (i >= 0) speedIdx = i;
} catch { /* storage unavailable */ }

function updateSpeedUi() {
  els.speedOut.textContent = `${SPEEDS[speedIdx]}×`;
  els.slower.disabled = speedIdx === 0;
  els.faster.disabled = speedIdx === SPEEDS.length - 1;
}
function speakFrom(i: number) {
  speechSynthesis.cancel();
  parts.slice(i).forEach((part, k) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = SPEECH_LANG[lang];
    u.rate = SPEEDS[speedIdx] ?? 1;
    u.onstart = () => { cur = i + k; };
    speechSynthesis.speak(u);
  });
}
function speak() {
  if (!hasSpeech || !narration) return;
  // Split into sentences: long single utterances get cut off in some browsers.
  parts = narration.match(/[^。！？.!?]+[。！？.!?]*/g) ?? [narration];
  speakFrom(0);
}
function changeSpeed(d: number) {
  speedIdx = Math.min(SPEEDS.length - 1, Math.max(0, speedIdx + d));
  try { localStorage.setItem('speed', String(SPEEDS[speedIdx])); } catch { /* ignore */ }
  updateSpeedUi();
  if (hasSpeech && speechSynthesis.speaking) speakFrom(cur);
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('unsupported')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

function renderList() {
  els.list.replaceChildren(...places.map((p) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const n = document.createElement('strong');
    n.textContent = placeName(p);
    const m = document.createElement('small');
    m.textContent = `${t().kind[p.kind] ?? ''} · ${fmtDist(p.dist, lang)}`;
    b.append(n, m);
    b.addEventListener('click', () => void showDetail(p));
    li.append(b);
    return li;
  }));
}

async function showDetail(p: Place) {
  const my = ++detailId;
  const s = t();
  selected = p;
  narration = '';
  stopSpeak();
  els.detail.hidden = false;
  els.dName.textContent = placeName(p);
  els.dMeta.textContent = `${s.kind[p.kind] ?? ''} · ${fmtDist(p.dist, lang)}`;
  els.dText.textContent = s.loadingIntro;
  els.speak.disabled = true;
  els.nav.href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
  els.src.hidden = true;
  els.note.hidden = true;
  els.detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const intro = await fetchIntro(p, lang);
    if (my !== detailId) return;
    if (!intro) { els.dText.textContent = s.noIntro; return; }
    const name = placeName(p);
    narration = `${s.intro(name, fmtDist(p.dist, lang), intro.extract)} ${s.outro(name)}`;
    els.dText.textContent = narration;
    els.speak.disabled = !hasSpeech;
    if (intro.translatedFrom) { els.note.textContent = s.note(intro.translatedFrom); els.note.hidden = false; }
    if (intro.url) { els.src.href = intro.url; els.src.hidden = false; }
  } catch (e) {
    if (my === detailId) els.dText.textContent = e instanceof QuotaError ? s.quotaFail : s.introFail;
  }
}

async function onFind() {
  els.find.disabled = true;
  stopSpeak();
  detailId++;
  selected = null;
  els.detail.hidden = true;
  places = [];
  renderList();
  try {
    setStatus(() => t().locating);
    let pos: GeolocationPosition;
    try {
      pos = await getPosition();
    } catch (e) {
      const denied = e instanceof GeolocationPositionError && e.code === 1;
      const unsupported = e instanceof Error && e.message === 'unsupported';
      setStatus(() => (denied ? t().geoDenied : unsupported ? t().geoUnsupported : t().geoFail));
      return;
    }
    setStatus(() => t().searching);
    try {
      places = await searchPlaces(pos.coords.latitude, pos.coords.longitude, Number(els.radius.value) * 1000);
    } catch {
      setStatus(() => t().searchFail);
      return;
    }
    renderList();
    const n = places.length;
    setStatus(() => (n ? t().found(n) : t().none));
  } finally {
    els.find.disabled = false;
  }
}

function applyLang() {
  const s = t();
  document.documentElement.lang = lang;
  document.title = s.title;
  els.title.textContent = s.title;
  els.radiusLabel.textContent = s.radius;
  els.find.textContent = s.find;
  els.speak.textContent = s.speak;
  els.stop.textContent = s.stop;
  els.nav.textContent = s.navigate;
  els.src.textContent = s.source;
  els.credits.textContent = s.credits;
  els.speedLabel.textContent = s.speed;
  els.status.textContent = statusFn();
  renderList();
  if (selected) void showDetail(selected);
}

els.lang.replaceChildren(...LANGS.map((l) => new Option(LANG_LABEL[l], l)));
els.lang.value = lang;
els.lang.addEventListener('change', () => {
  lang = els.lang.value as Lang;
  try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  stopSpeak();
  applyLang();
});
els.radius.addEventListener('input', () => { els.radiusOut.textContent = els.radius.value; });
els.find.addEventListener('click', () => void onFind());
els.speak.addEventListener('click', speak);
els.stop.addEventListener('click', stopSpeak);
els.slower.addEventListener('click', () => changeSpeed(-1));
els.faster.addEventListener('click', () => changeSpeed(1));
els.speak.hidden = els.stop.hidden = els.speedBox.hidden = !hasSpeech;
updateSpeedUi();
statusFn = () => t().hint;
applyLang();
