import { LANGS, LANG_LABEL, SPEECH_LANG, T, fmtDist, type Lang } from './i18n';
import { searchPlaces, fetchIntro, type Place } from './api';

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
function speak() {
  if (!hasSpeech || !narration) return;
  speechSynthesis.cancel();
  // Split into sentences: long single utterances get cut off in some browsers.
  for (const part of narration.match(/[^。！？.!?]+[。！？.!?]*/g) ?? [narration]) {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = SPEECH_LANG[lang];
    speechSynthesis.speak(u);
  }
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
  els.detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const intro = await fetchIntro(p, lang);
    if (my !== detailId) return;
    if (!intro) { els.dText.textContent = s.noIntro; return; }
    const name = placeName(p);
    narration = `${s.intro(name, fmtDist(p.dist, lang), intro.extract)} ${s.outro(name)}`;
    els.dText.textContent = narration;
    els.speak.disabled = !hasSpeech;
    if (intro.url) { els.src.href = intro.url; els.src.hidden = false; }
  } catch {
    if (my === detailId) els.dText.textContent = s.introFail;
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
els.speak.hidden = els.stop.hidden = !hasSpeech;
statusFn = () => t().hint;
applyLang();
