export type Lang = 'zh-TW' | 'zh-CN' | 'en';
export const LANGS: Lang[] = ['zh-TW', 'zh-CN', 'en'];
export const LANG_LABEL: Record<Lang, string> = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' };
export const SPEECH_LANG: Record<Lang, string> = { 'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', en: 'en-US' };

export interface Strings {
  title: string; find: string; radius: string; hint: string; locating: string; searching: string;
  found: (n: number) => string; none: string; geoDenied: string; geoUnsupported: string; geoFail: string;
  searchFail: string; loadingIntro: string; noIntro: string; introFail: string; speak: string; stop: string;
  navigate: string; speed: string; quotaFail: string; note: (from: 'zh' | 'en') => string; source: string; credits: string; kind: Record<string, string>;
  intro: (name: string, dist: string, extract: string) => string; outro: (name: string) => string;
}

export const T: Record<Lang, Strings> = {
  'zh-TW': {
    title: '台灣導遊小幫手', find: '📍 尋找附近景點', radius: '搜尋範圍',
    hint: '按下按鈕，開始尋找您附近的景點', locating: '正在取得您的位置…', searching: '正在搜尋附近景點…',
    found: (n) => `找到 ${n} 個景點，點選即可聽導覽`, none: '這個範圍內沒有找到景點，試試放大搜尋範圍',
    geoDenied: '無法取得位置：您拒絕了定位權限。請在瀏覽器設定中允許本網站使用位置，再按一次。',
    geoUnsupported: '此瀏覽器不支援定位功能。', geoFail: '取得位置失敗，請確認已開啟定位服務後再試一次。',
    searchFail: '景點資料服務暫時無法連線，請稍後再試。', loadingIntro: '導覽準備中…',
    noIntro: '這個景點在維基百科的中文與英文版都找不到對應條目，為避免編造內容，這裡不提供介紹。',
    introFail: '載入介紹失敗，請稍後再試。', speak: '🔊 語音導覽', stop: '⏹ 停止', navigate: '🧭 導航前往',
    speed: '語速', quotaFail: '翻譯服務今日額度已用完，請明天再試，或切換到有原生資料的語言。', note: (f) => `此介紹由維基百科${f === 'zh' ? '中文' : '英文'}版機器翻譯而成，僅供參考。`,
    source: '資料來源：維基百科', credits: '景點位置資料 © OpenStreetMap 貢獻者 (ODbL)；介紹內容來自維基百科與 Wikidata，必要時由 MyMemory 機器翻譯。',
    kind: { attraction: '景點', museum: '博物館', viewpoint: '觀景點', gallery: '美術館', zoo: '動物園', theme_park: '遊樂園', aquarium: '水族館', historic: '歷史古蹟', worship: '宗教場所', other: '其他' },
    intro: (n, d, e) => `各位旅客，歡迎來到「${n}」！這裡距離您目前的位置約 ${d}。${e}`,
    outro: (n) => `以上就是「${n}」的簡介，祝您旅途愉快！`,
  },
  'zh-CN': {
    title: '台湾导游小帮手', find: '📍 查找附近景点', radius: '搜索范围',
    hint: '按下按钮，开始查找您附近的景点', locating: '正在获取您的位置…', searching: '正在搜索附近景点…',
    found: (n) => `找到 ${n} 个景点，点击即可听导览`, none: '这个范围内没有找到景点，试试扩大搜索范围',
    geoDenied: '无法获取位置：您拒绝了定位权限。请在浏览器设置中允许本网站使用位置，再点一次。',
    geoUnsupported: '此浏览器不支持定位功能。', geoFail: '获取位置失败，请确认已开启定位服务后再试一次。',
    searchFail: '景点数据服务暂时无法连接，请稍后再试。', loadingIntro: '导览准备中…',
    noIntro: '这个景点在维基百科的中文与英文版都找不到对应条目，为避免编造内容，这里不提供介绍。',
    introFail: '加载介绍失败，请稍后再试。', speak: '🔊 语音导览', stop: '⏹ 停止', navigate: '🧭 导航前往',
    speed: '语速', quotaFail: '翻译服务今日额度已用完，请明天再试，或切换到有原生资料的语言。', note: (f) => `此介绍由维基百科${f === 'zh' ? '中文' : '英文'}版机器翻译而成，仅供参考。`,
    source: '数据来源：维基百科', credits: '景点位置数据 © OpenStreetMap 贡献者 (ODbL)；介绍内容来自维基百科与 Wikidata，必要时由 MyMemory 机器翻译。',
    kind: { attraction: '景点', museum: '博物馆', viewpoint: '观景点', gallery: '美术馆', zoo: '动物园', theme_park: '游乐园', aquarium: '水族馆', historic: '历史古迹', worship: '宗教场所', other: '其他' },
    intro: (n, d, e) => `各位游客，欢迎来到“${n}”！这里距离您当前的位置约 ${d}。${e}`,
    outro: (n) => `以上就是“${n}”的简介，祝您旅途愉快！`,
  },
  en: {
    title: 'Taiwan Tour Guide', find: '📍 Find nearby attractions', radius: 'Search radius',
    hint: 'Tap the button to find attractions near you', locating: 'Getting your location…', searching: 'Searching nearby attractions…',
    found: (n) => `Found ${n} attractions. Tap one for a guided intro.`, none: 'No attractions found in this range. Try a larger radius.',
    geoDenied: 'Location permission was denied. Please allow location access for this site in your browser settings and try again.',
    geoUnsupported: 'This browser does not support geolocation.', geoFail: 'Could not get your location. Please make sure location services are on and try again.',
    searchFail: 'The attraction data service is temporarily unavailable. Please try again later.', loadingIntro: 'Preparing your tour…',
    noIntro: 'This place has no matching article on the Chinese or English Wikipedia, so no introduction is shown rather than inventing one.',
    introFail: 'Failed to load the introduction. Please try again later.', speak: '🔊 Audio guide', stop: '⏹ Stop', navigate: '🧭 Directions',
    speed: 'Speed', quotaFail: "Today's translation quota is used up. Try again tomorrow or switch to a language with native content.", note: (f) => `Machine-translated from the ${f === 'zh' ? 'Chinese' : 'English'} Wikipedia article; for reference only.`,
    source: 'Source: Wikipedia', credits: 'Place data © OpenStreetMap contributors (ODbL). Introductions from Wikipedia and Wikidata, machine-translated by MyMemory when needed.',
    kind: { attraction: 'Attraction', museum: 'Museum', viewpoint: 'Viewpoint', gallery: 'Gallery', zoo: 'Zoo', theme_park: 'Theme park', aquarium: 'Aquarium', historic: 'Historic site', worship: 'Place of worship', other: 'Other' },
    intro: (n, d, e) => `Welcome to ${n}! You are about ${d} away from it. ${e}`,
    outro: (n) => `That was a short introduction to ${n}. Enjoy your trip!`,
  },
};

export function fmtDist(m: number, lang: Lang): string {
  const unit = lang === 'zh-TW' ? ['公尺', '公里'] : lang === 'zh-CN' ? ['米', '公里'] : ['m', 'km'];
  const sp = lang === 'en' ? ' ' : '';
  return m < 1000 ? `${Math.round(m)}${sp}${unit[0]}` : `${(m / 1000).toFixed(1)}${sp}${unit[1]}`;
}
