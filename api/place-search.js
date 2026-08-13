function clean(v, max = 500) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')).trim();
}

async function fetchText(url, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SimpleReviewMaker/1.5)',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5'
      },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
    .replace(/[^가-힣a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreName(query, name, context = '') {
  const q = normalize(query), n = normalize(name), c = normalize(context);
  if (!q || !n) return 0;
  let score = 0;
  if (n === q) score += 100;
  if (n.includes(q) || q.includes(n)) score += 50;
  const tokens = q.split(' ').filter(Boolean);
  for (const t of tokens) {
    if (n.includes(t)) score += 15;
    else if (c.includes(t)) score += 6;
  }
  return score;
}

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const m = String(html || '').match(re);
    if (m && m[1]) return decodeHtml(m[1]).replace(/\\u([0-9a-f]{4})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))).trim();
  }
  return '';
}

function parseProfile(html, url, query) {
  const text = htmlToText(html);
  let name = firstMatch(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i
  ]);
  name = name.replace(/\s*-\s*[^-]*?(?:맛집|다이닝코드)[\s\S]*$/i, '').replace(/\s*\|\s*다이닝코드.*$/i, '').trim();
  if (!name) {
    const m = text.match(/(?:^|\s)([가-힣A-Za-z0-9&.'’\- ]{2,40})\s+(?:저장|순대국|카페|한식|일식|중식|양식)/);
    if (m) name = m[1].trim();
  }

  let address = firstMatch(html, [
    /"streetAddress"\s*:\s*"([^"]+)"/i,
    /"address"\s*:\s*\{[^}]*"streetAddress"\s*:\s*"([^"]+)"/i,
    /"roadAddress"\s*:\s*"([^"]+)"/i
  ]);
  if (!address) {
    const region = '(?:서울특별시|서울|경기도|경기|인천광역시|인천|부산광역시|부산|대구광역시|대구|대전광역시|대전|광주광역시|광주|울산광역시|울산|세종특별자치시|세종|강원특별자치도|강원도|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주)';
    const m = text.match(new RegExp(`${region}\\s+[가-힣]+(?:시|군|구)\\s+[가-힣0-9·.-]+(?:로|길)\\s*\\d+(?:-\\d+)?`));
    if (m) address = m[0];
  }
  if (!address) {
    const m = text.match(/(?:서울특별시|경기도|인천광역시|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)[^0-9]{2,45}\d{1,4}(?:-\d{1,4})?/);
    if (m) address = m[0].replace(/\s+/g, ' ').trim();
  }

  let context = '';
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tm = escapedName ? text.match(new RegExp(`${escapedName}\\s+([^]{0,90}?)(?:저장|\\d(?:\\.\\d)?\\s*\\()`)) : null;
  if (tm) context = clean(tm[1], 90);
  const rid = (url.match(/[?&]rid=([^&]+)/) || [])[1] || '';
  return { id: rid, name: clean(name, 80), address: clean(address, 120), context, profileUrl: url, score: scoreName(query, name, `${address} ${context}`) };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = clean(req.query?.q || req.body?.q, 80);
  if (!q || q.length < 2) return res.status(200).json({ query:q, places:[] });
  try {
    const listUrl = `https://www.diningcode.com/list.dc?query=${encodeURIComponent(q)}`;
    const html = await fetchText(listUrl, 6500);
    const urls = [];
    const re = /(?:https?:\/\/www\.diningcode\.com\/)?profile\.php\?rid=([A-Za-z0-9_-]+)/gi;
    let m;
    while ((m = re.exec(html)) && urls.length < 12) {
      const url = `https://www.diningcode.com/profile.php?rid=${m[1]}`;
      if (!urls.includes(url)) urls.push(url);
    }
    const settled = await Promise.allSettled(urls.slice(0, 8).map(async url => parseProfile(await fetchText(url, 5200), url, q)));
    const places = settled.filter(x => x.status === 'fulfilled' && x.value && x.value.name)
      .map(x => x.value)
      .filter(x => x.score >= 20)
      .sort((a,b) => b.score - a.score)
      .slice(0, 6);
    return res.status(200).json({ query:q, places });
  } catch (e) {
    return res.status(200).json({ query:q, places:[], error:'매장 후보 검색에 실패했습니다.' });
  }
};
