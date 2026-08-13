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

async function fetchText(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SimpleReviewMaker/1.6)',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5'
      },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^가-힣a-z0-9]+/g, '')
    .trim();
}

const FOOD_WORDS = [
  '떡볶이','순대국','순댓국','국밥','해장국','감자탕','설렁탕','곰탕','갈비탕',
  '칼국수','수제비','냉면','우동','라멘','라면','초밥','스시','돈까스','돈카츠',
  '파스타','피자','치킨','버거','햄버거','카페','커피','베이커리','빵집','식당','맛집',
  '분식','고기','삼겹살','곱창','막창','족발','보쌈','김밥','닭갈비','쭈꾸미','샤브샤브'
];
const DESCRIPTOR_WORDS = ['전문점','전문','뚝배기','본점','직영점','매장'];

function stripFoodSuffix(q) {
  let x = normalize(q);
  let category = '';
  for (const w of FOOD_WORDS.sort((a,b)=>b.length-a.length)) {
    if (x.endsWith(w)) { category = w; x = x.slice(0, -w.length); break; }
  }
  for (const w of DESCRIPTOR_WORDS.sort((a,b)=>b.length-a.length)) {
    if (x.endsWith(w)) x = x.slice(0, -w.length);
  }
  return { root:x, category };
}

function queryVariants(q) {
  const raw = clean(q, 80);
  const compact = normalize(raw);
  const {root, category} = stripFoodSuffix(raw);
  const set = new Set([raw, compact]);
  if (root && category) {
    set.add(`${root} ${category}`);
    set.add(root);
    for (const d of DESCRIPTOR_WORDS) {
      if (root.endsWith(d)) set.add(root.slice(0,-d.length));
    }
    if (root.length >= 3) set.add(root.slice(0, Math.max(2, root.length - 1)));
  }
  if (compact.length >= 4) set.add(compact.slice(0, Math.ceil(compact.length * 0.6)));
  return [...set].map(x=>clean(x,80)).filter(x=>x.length>=2).slice(0,6);
}

function bigrams(s) {
  const x = normalize(s);
  if (x.length < 2) return new Set(x ? [x] : []);
  const out = new Set();
  for (let i=0;i<x.length-1;i++) out.add(x.slice(i,i+2));
  return out;
}

function dice(a,b) {
  const A=bigrams(a), B=bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter=0; for (const x of A) if (B.has(x)) inter++;
  return (2*inter)/(A.size+B.size);
}

function commonPrefixRatio(a,b) {
  const A=normalize(a), B=normalize(b), n=Math.min(A.length,B.length);
  let i=0; while(i<n && A[i]===B[i]) i++;
  return n ? i/n : 0;
}

function isSubsequence(shorter,longer) {
  const a=normalize(shorter), b=normalize(longer);
  if (!a || !b || a.length>b.length) return false;
  let i=0; for (const c of b) if (c===a[i]) i++;
  return i===a.length;
}

function scoreName(query, name, context = '') {
  const q = normalize(query), n = normalize(name), c = normalize(context);
  if (!q || !n) return 0;
  let score = 0;
  if (n === q) score += 120;
  if (n.includes(q)) score += 70;
  if (q.includes(n)) score += 55;
  if (isSubsequence(q,n)) score += 48;
  score += Math.round(dice(q,n) * 55);
  score += Math.round(commonPrefixRatio(q,n) * 30);

  const qr = stripFoodSuffix(q).root;
  const nr = stripFoodSuffix(n).root;
  if (qr && nr) {
    if (qr === nr) score += 55;
    else if (nr.includes(qr) || qr.includes(nr)) score += 35;
    else if (qr.length >= 2 && nr.startsWith(qr)) score += 25;
  }
  if (c.includes(q)) score += 12;
  return score;
}

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const m = String(html || '').match(re);
    if (m && m[1]) return decodeHtml(m[1])
      .replace(/\\u([0-9a-f]{4})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)))
      .trim();
  }
  return '';
}

function extractProfileUrls(html) {
  const raw = decodeHtml(String(html || ''));
  const urls = [];
  const seen = new Set();
  const patterns = [
    /https?:\\?\/?\\?\/www\.diningcode\.com\\?\/profile\.php\?rid=([A-Za-z0-9_-]+)/gi,
    /(?:https?:\/\/www\.diningcode\.com\/)?profile\.php\?rid=([A-Za-z0-9_-]+)/gi,
    /diningcode\.com%2Fprofile\.php%3Frid%3D([A-Za-z0-9_-]+)/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(raw)) && urls.length < 30) {
      const rid = m[1];
      if (!seen.has(rid)) {
        seen.add(rid);
        urls.push(`https://www.diningcode.com/profile.php?rid=${rid}`);
      }
    }
  }
  return urls;
}

function parseProfile(html, url, query) {
  const text = htmlToText(html);
  let name = firstMatch(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i
  ]);
  name = name
    .replace(/\s*-\s*[^-]*?(?:맛집|다이닝코드)[\s\S]*$/i, '')
    .replace(/\s*\|\s*다이닝코드.*$/i, '')
    .replace(/\s*-\s*다이닝코드.*$/i, '')
    .trim();

  let address = firstMatch(html, [
    /"streetAddress"\s*:\s*"([^"]+)"/i,
    /"roadAddress"\s*:\s*"([^"]+)"/i,
    /"address"\s*:\s*"((?:서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충청|전라|경상|제주)[^"]+)"/i
  ]);
  if (!address) {
    const m = text.match(/(?:서울특별시|서울|경기도|경기|인천광역시|인천|부산광역시|부산|대구광역시|대구|대전광역시|대전|광주광역시|광주|울산광역시|울산|세종특별자치시|세종|강원특별자치도|강원도|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주)\s+[가-힣]+(?:시|군|구)?\s+[가-힣0-9·.-]+(?:로|길)\s*\d+(?:-\d+)?(?:\s+[^\n]{0,30})?/);
    if (m) address = m[0].replace(/\s+/g,' ').trim();
  }

  let context = '';
  const keywords = [];
  const km = text.match(/(?:혼밥|데이트|가족외식|점심식사|저녁식사|셀프바|셀프코너|주차|지역주민이찾는|캐주얼한|깔끔한|매콤한|조용한|푸짐한|가성비좋은)/g);
  if (km) keywords.push(...[...new Set(km)].slice(0,4));
  if (keywords.length) context = keywords.join(' · ');

  const rid = (url.match(/[?&]rid=([^&]+)/) || [])[1] || '';
  const score = scoreName(query, name, `${address} ${context}`);
  return { id:rid, name:clean(name,80), address:clean(address,140), context, profileUrl:url, score };
}

async function discoverFromDiningCode(q) {
  try {
    const html = await fetchText(`https://www.diningcode.com/list.dc?query=${encodeURIComponent(q)}`, 6000);
    return extractProfileUrls(html);
  } catch (_) { return []; }
}

async function discoverFromNaver(q) {
  try {
    const query = `site:diningcode.com/profile.php ${q}`;
    const html = await fetchText(`https://search.naver.com/search.naver?where=web&query=${encodeURIComponent(query)}`, 5200);
    return extractProfileUrls(html);
  } catch (_) { return []; }
}

async function discoverFromDaum(q) {
  try {
    const query = `site:www.diningcode.com/profile.php ${q}`;
    const html = await fetchText(`https://search.daum.net/search?w=tot&q=${encodeURIComponent(query)}`, 5200);
    return extractProfileUrls(html);
  } catch (_) { return []; }
}

async function collectUrls(query) {
  const variants = queryVariants(query);
  const all = new Set();
  for (let i=0;i<variants.length;i++) {
    const v = variants[i];
    const jobs = [discoverFromDiningCode(v)];
    if (i < 3) jobs.push(discoverFromNaver(v), discoverFromDaum(v));
    const settled = await Promise.allSettled(jobs);
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue;
      for (const u of s.value || []) all.add(u);
    }
    if (all.size >= 18) break;
  }
  return [...all].slice(0,22);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = clean(req.query?.q || req.body?.q, 80);
  if (!q || q.length < 2) return res.status(200).json({ query:q, places:[] });

  try {
    const urls = await collectUrls(q);
    const settled = await Promise.allSettled(
      urls.map(async url => parseProfile(await fetchText(url, 5200), url, q))
    );

    const byId = new Map();
    for (const s of settled) {
      if (s.status !== 'fulfilled' || !s.value?.name) continue;
      const p = s.value;
      if (p.score < 25) continue;
      const prev = byId.get(p.id);
      if (!prev || p.score > prev.score) byId.set(p.id,p);
    }

    const places = [...byId.values()]
      .sort((a,b) => b.score - a.score || Number(Boolean(b.address)) - Number(Boolean(a.address)))
      .slice(0,12);

    return res.status(200).json({
      query:q,
      places,
      relaxed: queryVariants(q).slice(1),
      totalCandidates: places.length
    });
  } catch (e) {
    return res.status(200).json({ query:q, places:[], error:'매장 후보 검색에 실패했습니다.' });
  }
};