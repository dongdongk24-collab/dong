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
  return decodeHtml(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

async function fetchText(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SimpleReviewMaker/1.2)',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6'
      },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function countMatches(text, words) {
  const lower = String(text || '').toLowerCase();
  return words.reduce((sum, w) => {
    const needle = String(w).toLowerCase();
    if (!needle) return sum;
    let i = 0, c = 0;
    while ((i = lower.indexOf(needle, i)) !== -1) {
      c += 1;
      i += Math.max(needle.length, 1);
    }
    return sum + c;
  }, 0);
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^가-힣a-z0-9]+/g, ' ')
    .replace(/\b(본점|지점|점|매장)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function placeTokens(place) {
  return normalizeForMatch(place)
    .split(' ')
    .filter(x => x.length >= 2 || /\d/.test(x));
}

function relevanceScore(place, text) {
  const tokens = placeTokens(place);
  if (!tokens.length) return 0;
  const hay = normalizeForMatch(text);
  const matched = tokens.filter(t => hay.includes(t)).length;
  return matched / tokens.length;
}

function inferCategory(place, menu, researchText) {
  const p = `${place || ''}`;
  const m = `${menu || ''}`;
  const r = `${researchText || ''}`;

  const defs = [
    { key: 'cafe', label: '카페', words: ['카페','커피','아메리카노','라떼','에이드','스무디','케이크','베이커리','디저트','브런치','크로플','빵','티라미수','마들렌'] },
    { key: 'korean', label: '한식 음식점', words: ['한식','백반','국밥','찌개','전골','불고기','갈비','삼겹살','곱창','막창','냉면','보쌈','족발','순대','제육','비빔밥','칼국수','수제비'] },
    { key: 'japanese', label: '일식 음식점', words: ['일식','초밥','스시','사시미','돈까스','돈카츠','라멘','우동','소바','규동','덮밥','이자카야','히츠마부시'] },
    { key: 'chinese', label: '중식 음식점', words: ['중식','짜장','짜장면','짬뽕','탕수육','마라','양꼬치','훠궈'] },
    { key: 'western', label: '양식 음식점', words: ['양식','파스타','피자','스테이크','리조또','라자냐','샐러드'] },
    { key: 'bar', label: '주점', words: ['술집','주점','포차','호프','맥주','소주','하이볼','와인바','이자카야'] },
    { key: 'restaurant', label: '음식점', words: ['식당','음식점','맛집','메뉴','식사','반찬','고기','국물','밥','면','튀김','구이','볶음'] }
  ];

  const scored = defs.map(d => ({
    ...d,
    score:
      countMatches(p, d.words) * 4 +
      countMatches(m, d.words) * 8 +
      countMatches(r.slice(0, 45000), d.words)
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score <= 0) return { key: 'restaurant', label: '음식점', score: 0 };

  const cafe = scored.find(x => x.key === 'cafe');
  const restaurantLike = scored.filter(x => ['korean','japanese','chinese','western','bar','restaurant'].includes(x.key))[0];
  if (restaurantLike && restaurantLike.score >= 8 && cafe && cafe.score < restaurantLike.score * 1.4) {
    return restaurantLike;
  }
  return top;
}

function featureDefsFor(categoryKey) {
  const common = [
    { key: 'parking', label: '주차 편의', words: ['무료주차','무료 주차','주차장','주차'] },
    { key: 'friendly', label: '친절한 응대', words: ['친절','응대가 좋','서비스가 좋'] },
    { key: 'value', label: '가성비', words: ['가성비','가격이 괜찮','가격 괜찮'] },
    { key: 'wait', label: '웨이팅·대기', words: ['웨이팅','대기','기다'] },
    { key: 'clean', label: '깔끔함', words: ['깔끔','청결','깨끗'] },
    { key: 'revisit', label: '재방문 언급', words: ['재방문','또 방문','다시 방문','또 가고'] }
  ];

  if (categoryKey === 'cafe') {
    return common.concat([
      { key: 'ocean', label: '오션뷰·바다 전망', words: ['오션뷰','바다','해변','일몰','전망','뷰'] },
      { key: 'space', label: '넓은 공간·여러 층', words: ['대형카페','대형 카페','넓','여러층','여러 층','층마다','루프탑'] },
      { key: 'interior', label: '인테리어·포토존', words: ['인테리어','테마','컨셉','예쁜','포토존'] },
      { key: 'quiet', label: '편안한 분위기', words: ['조용','여유','편안'] },
      { key: 'terrace', label: '테라스·야외 공간', words: ['테라스','야외좌석','야외 좌석','야외공간'] },
      { key: 'dessert', label: '디저트', words: ['치즈케이크','케이크','디저트','베이커리','도넛','빵'] },
      { key: 'coffee', label: '커피', words: ['아메리카노','커피','라떼','원두'] }
    ]);
  }

  return common.concat([
    { key: 'flavor', label: '음식 맛', words: ['맛있','맛이 좋','간이 좋','풍미','고소','담백','매콤','칼칼'] },
    { key: 'portion', label: '양이 넉넉함', words: ['양이 많','푸짐','양 많','넉넉'] },
    { key: 'side', label: '반찬·구성', words: ['반찬','밑반찬','찬이','구성 좋'] },
    { key: 'meat', label: '고기 상태', words: ['고기','육질','잡내 없','부드럽','두툼'] },
    { key: 'soup', label: '국물·육수', words: ['국물','육수','진하','깔끔한 국물'] },
    { key: 'fresh', label: '재료 신선도', words: ['신선','재료가 좋','싱싱'] },
    { key: 'family', label: '가족 식사', words: ['가족','부모님','아이와','가족모임'] },
    { key: 'solo', label: '혼밥 편의', words: ['혼밥','혼자 먹','1인'] },
    { key: 'atmosphere', label: '식사 분위기', words: ['분위기 좋','편하게 식사','식사하기 좋','깔끔한 분위기'] }
  ]);
}

function extractFeatures(text, categoryKey) {
  const defs = featureDefsFor(categoryKey);
  return defs
    .map(d => ({ ...d, score: countMatches(text, d.words) }))
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ key, label, score }) => ({ key, label, score }));
}

async function diningCodeResearch(place) {
  const queryUrl = `https://www.diningcode.com/list.dc?query=${encodeURIComponent(place)}`;
  const listHtml = await fetchText(queryUrl);
  const profileMatch = listHtml.match(/(?:href=["'])([^"']*profile\.php\?rid=[^"'#& ]+)/i)
    || listHtml.match(/(https?:\/\/www\.diningcode\.com\/profile\.php\?rid=[^"'#& ]+)/i);
  if (!profileMatch) return null;

  let profileUrl = profileMatch[1] || profileMatch[0];
  if (profileUrl.startsWith('/')) profileUrl = `https://www.diningcode.com${profileUrl}`;
  if (!profileUrl.startsWith('http')) profileUrl = `https://www.diningcode.com/${profileUrl.replace(/^\//, '')}`;

  const profileHtml = await fetchText(profileUrl);
  const text = htmlToText(profileHtml).slice(0, 100000);
  return { name: '다이닝코드', url: profileUrl, text, relevance: relevanceScore(place, text.slice(0, 12000)) };
}

async function naverSnippetResearch(place) {
  const q = `${place} 후기`;
  const url = `https://search.naver.com/search.naver?where=view&query=${encodeURIComponent(q)}`;
  const html = await fetchText(url, 5000);
  const text = htmlToText(html).slice(0, 70000);
  return { name: '네이버 검색', url, text, relevance: relevanceScore(place, text.slice(0, 15000)) };
}

async function daumSnippetResearch(place) {
  const q = `${place} 후기`;
  const url = `https://search.daum.net/search?w=blog&q=${encodeURIComponent(q)}`;
  const html = await fetchText(url, 5000);
  const text = htmlToText(html).slice(0, 70000);
  return { name: '다음 검색', url, text, relevance: relevanceScore(place, text.slice(0, 15000)) };
}

async function researchPlace(place, menu) {
  const jobs = [diningCodeResearch(place), naverSnippetResearch(place), daumSnippetResearch(place)];
  const settled = await Promise.allSettled(jobs);
  const sources = settled
    .filter(x => x.status === 'fulfilled' && x.value && x.value.text)
    .map(x => x.value)
    .filter(x => x.relevance >= 0.34 || placeTokens(place).length <= 1);

  const combined = sources.map(s => s.text).join(' ');
  const category = inferCategory(place, menu, combined);
  const features = extractFeatures(combined, category.key);
  return {
    researched: sources.length > 0 && features.length > 0,
    category,
    features,
    sources: sources.map(s => ({ name: s.name, url: s.url }))
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function naturalizeFact(text) {
  let t = clean(text, 220)
    .replace(/["'“”‘’]/g, '')
    .replace(/\s*(라는|이라는|다는)\s*내용\s*(을|도)?\s*(넣어|추가해|반영해|써|적어)\s*(줘|주세요)?\s*$/i, '')
    .replace(/\s*(라고|다고)?\s*(넣어|추가해|반영해|써|적어|언급해)\s*(줘|주세요)?\s*$/i, '')
    .replace(/\s*(내용)?\s*위주로\s*(써|작성해)\s*(줘|주세요)?\s*$/i, '')
    .replace(/[.!?]+$/, '')
    .trim();

  if (!t || /^(음식|메뉴|맛|분위기|인테리어|서비스|친절|가성비|주차|뷰)$/.test(t)) return '';

  const reps = [
    [/맛있었음$/, '맛있었어요'], [/맛있었다$/, '맛있었어요'], [/좋았음$/, '좋았어요'], [/좋았다$/, '좋았어요'],
    [/괜찮았음$/, '괜찮았어요'], [/괜찮았다$/, '괜찮았어요'], [/편했음$/, '편했어요'], [/편했다$/, '편했어요'],
    [/넓었음$/, '넓었어요'], [/넓었다$/, '넓었어요'], [/친절했음$/, '친절했어요'], [/친절했다$/, '친절했어요'],
    [/했음$/, '했어요'], [/였다$/, '였어요'], [/였음$/, '였어요']
  ];
  for (const [r, v] of reps) {
    if (r.test(t)) { t = t.replace(r, v); break; }
  }
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function parseInstruction(note, categoryKey, menu) {
  const raw = clean(note, 500);
  const lower = raw.toLowerCase();
  const exclude = new Set();
  const exclusionRules = [
    ['parking', /주차.{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['friendly', /(친절|서비스).{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['value', /(가성비|가격).{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['wait', /(웨이팅|대기).{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['clean', /(깔끔|청결|깨끗).{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['ocean', /(바다|오션뷰|전망|뷰).{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['interior', /(인테리어|포토존).{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['atmosphere', /분위기.{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['flavor', /(맛|음식).{0,8}(빼|제외|언급하지|쓰지|넣지)/],
    ['portion', /(양|푸짐).{0,8}(빼|제외|언급하지|쓰지|넣지)/]
  ];
  exclusionRules.forEach(([key, re]) => { if (re.test(lower)) exclude.add(key); });

  let focus = '';
  if (/(음식|메뉴|맛|식사).{0,10}(위주|중심|많이)/.test(lower)) focus = 'food';
  else if (/(분위기|인테리어|뷰|공간).{0,10}(위주|중심|많이)/.test(lower)) focus = 'atmosphere';
  else if (/(서비스|친절).{0,10}(위주|중심|많이)/.test(lower)) focus = 'service';

  let customSentence = '';
  const isCafe = categoryKey === 'cafe';
  if (raw && !/(빼|제외|언급하지|쓰지|넣지)/.test(lower)) {
    if (/친절/.test(lower)) customSentence = isCafe ? '직원분들도 친절해서 기분 좋게 머물다 왔어요.' : '직원분들도 친절해서 기분 좋게 식사했어요.';
    else if (/(깔끔|깨끗|청결)/.test(lower)) customSentence = isCafe ? '매장도 깔끔해서 편하게 머물기 좋았어요.' : '매장도 깔끔해서 편하게 식사하기 좋았어요.';
    else if (/(조용|편안)/.test(lower)) customSentence = isCafe ? '분위기도 편안해서 여유롭게 쉬기 좋았어요.' : '분위기도 편안해서 식사하기 좋았어요.';
    else if (/(양이 많|양 많|푸짐|넉넉)/.test(lower)) customSentence = '양도 넉넉해서 든든하게 먹기 좋았어요.';
    else if (/(주차.{0,8}(편|좋|쉬))/i.test(lower)) customSentence = '주차도 편해서 차로 방문하기 좋았어요.';
    else if (/(또 가|재방문|다시 가)/.test(lower)) customSentence = isCafe ? '다음에 근처 오면 또 들르고 싶어요.' : '다음에 근처 오면 다른 메뉴도 먹어보고 싶어요.';
    else if (/맛있/.test(lower) && menu) customSentence = `${menu}도 맛있게 잘 먹었어요.`;
    else customSentence = naturalizeFact(raw);
  }

  return { exclude, focus, customSentence };
}

function researchedSentences(features, categoryKey) {
  const keys = new Set((features || []).map(f => f.key));
  const pool = [];
  if (categoryKey === 'cafe') {
    if (keys.has('ocean')) pool.push({key:'ocean', text:'바다 전망이 좋다는 후기가 많은 곳이라 뷰까지 함께 즐기기 좋았어요.'});
    if (keys.has('space')) pool.push({key:'space', text:'공간이 넓고 층별로 둘러보기 좋다는 이야기가 많은 편이라 여유롭게 머물기 좋았어요.'});
    if (keys.has('interior')) pool.push({key:'interior', text:'인테리어나 포토존 이야기가 자주 보여서 공간 구경하는 재미도 있는 곳이었어요.'});
    if (keys.has('dessert')) pool.push({key:'dessert', text:'디저트 메뉴에 대한 언급도 많은 편이라 커피와 같이 즐기기 좋았어요.'});
    if (keys.has('coffee')) pool.push({key:'coffee', text:'커피 메뉴를 좋게 본 후기도 많아 음료와 함께 여유롭게 즐기기 좋았어요.'});
    if (keys.has('parking')) pool.push({key:'parking', text:'주차가 편하다는 후기도 많아 차로 방문하기 괜찮은 곳이었어요.'});
    if (keys.has('quiet')) pool.push({key:'quiet', text:'편하게 쉬기 좋다는 평이 많아 여유롭게 머물기 좋았어요.'});
    if (keys.has('friendly')) pool.push({key:'friendly', text:'직원 응대가 친절하다는 이야기도 많이 보여 기분 좋게 이용하기 좋았어요.'});
  } else {
    if (keys.has('flavor')) pool.push({key:'flavor', text:'음식 맛이 좋다는 후기가 많이 보이는 곳이라 전체적으로 만족스럽게 식사했어요.'});
    if (keys.has('portion')) pool.push({key:'portion', text:'양이 넉넉하다는 이야기도 많아서 든든하게 먹기 좋았어요.'});
    if (keys.has('side')) pool.push({key:'side', text:'반찬이나 메뉴 구성이 괜찮다는 평이 많아 한 끼 식사로 만족스러웠어요.'});
    if (keys.has('meat')) pool.push({key:'meat', text:'고기 상태나 식감에 대한 좋은 평이 많아 고기 메뉴 좋아하면 만족하기 좋은 곳이었어요.'});
    if (keys.has('soup')) pool.push({key:'soup', text:'국물이나 육수 맛을 좋게 보는 후기가 많아 뜨끈하게 먹기 좋았어요.'});
    if (keys.has('fresh')) pool.push({key:'fresh', text:'재료가 신선하다는 평도 자주 보여서 음식 전반이 깔끔한 느낌이었어요.'});
    if (keys.has('family')) pool.push({key:'family', text:'가족끼리 식사하기 좋다는 후기도 많아 모임 장소로도 괜찮아 보여요.'});
    if (keys.has('solo')) pool.push({key:'solo', text:'혼자 식사하기 편하다는 이야기도 있어 가볍게 한 끼 먹기 좋았어요.'});
    if (keys.has('parking')) pool.push({key:'parking', text:'주차가 편하다는 후기도 많아 차로 방문하기 괜찮았어요.'});
    if (keys.has('clean')) pool.push({key:'clean', text:'매장이 깔끔하다는 평이 많아 편하게 식사하기 좋았어요.'});
    if (keys.has('friendly')) pool.push({key:'friendly', text:'직원분들이 친절하다는 후기도 많아 기분 좋게 식사하기 좋았어요.'});
    if (keys.has('atmosphere')) pool.push({key:'atmosphere', text:'식사하기 편한 분위기라는 이야기도 많아 여유롭게 한 끼 하기 좋았어요.'});
  }
  return pool;
}

function buildReview({ place, menu, note, length, tone, emoji, features, category }) {
  const em = emoji ? (tone === '밝게' ? pick([' 😊', ' ✨', ' 👍']) : pick(['', ' 😊'])) : '';
  const isCafe = category?.key === 'cafe';
  const directive = parseInstruction(note, category?.key || 'restaurant', menu);

  const openings = tone === '담백하게'
    ? [`${place}에 다녀왔어요.`, `${place} 방문했습니다.`]
    : tone === '밝게'
      ? [`${place} 다녀왔어요!${em}`, `${place} 방문했는데 기분 좋게 다녀왔어요!${em}`]
      : [`${place} 다녀왔어요!`, `${place} 방문했어요.`];

  const parts = [pick(openings)];
  if (menu) {
    parts.push(isCafe
      ? pick([`${menu} 주문해서 먹어봤어요.`, `이번에는 ${menu}로 주문했어요.`, `${menu} 먹어봤어요.`])
      : pick([`${menu} 주문해서 먹었어요.`, `이번에는 ${menu}로 주문했는데 한 끼 식사로 괜찮았어요.`, `${menu} 먹어봤어요.`]));
  }

  if (directive.customSentence) parts.push(directive.customSentence);

  let researchPool = researchedSentences(features || [], category?.key || 'restaurant')
    .filter(x => !directive.exclude.has(x.key));

  if (directive.focus === 'food') {
    const foodKeys = new Set(isCafe ? ['coffee','dessert'] : ['flavor','portion','side','meat','soup','fresh']);
    researchPool.sort((a,b) => Number(foodKeys.has(b.key)) - Number(foodKeys.has(a.key)));
  } else if (directive.focus === 'atmosphere') {
    const atmosphereKeys = new Set(isCafe ? ['ocean','space','interior','quiet'] : ['atmosphere','clean','family']);
    researchPool.sort((a,b) => Number(atmosphereKeys.has(b.key)) - Number(atmosphereKeys.has(a.key)));
  } else if (directive.focus === 'service') {
    researchPool.sort((a,b) => Number(b.key === 'friendly') - Number(a.key === 'friendly'));
  }

  if (researchPool.length && (length !== '아주 짧게' || !directive.customSentence)) {
    parts.push(researchPool[0].text);
  }

  const closes = isCafe
    ? [`전체적으로 편하게 다녀오기 좋았어요.${em}`, `다음에 근처 가면 또 들르고 싶어요.${em}`, `부담 없이 들르기 좋은 카페였어요.${em}`]
    : [`전체적으로 편하게 식사하고 나오기 좋았어요.${em}`, `다음에 근처 가면 다른 메뉴도 먹어보고 싶어요.${em}`, `한 끼 식사하기 괜찮은 곳이었어요.${em}`];

  if (length === '아주 짧게') return parts.slice(0, directive.customSentence ? 3 : 2).join(' ').trim();
  if (length === '보통') parts.push(pick(closes));
  else if (parts.length < 3) parts.push(pick(closes));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const place = clean(req.body?.place, 120);
  const menu = clean(req.body?.menu, 220);
  const note = clean(req.body?.note, 500);
  const length = clean(req.body?.length, 20) || '짧게';
  const tone = clean(req.body?.tone, 20) || '자연스럽게';
  const emoji = req.body?.emoji !== false;

  if (!place) return res.status(400).json({ error: '상호명 또는 장소명을 입력해 주세요.' });

  let research = { researched: false, category: inferCategory(place, menu, ''), features: [], sources: [] };
  try { research = await researchPlace(place, menu); } catch (_) {}

  const review = buildReview({ place, menu, note, length, tone, emoji, features: research.features, category: research.category });

  return res.status(200).json({
    review,
    researched: research.researched,
    category: research.category?.label || '음식점',
    features: research.features.map(f => f.label),
    sources: research.sources
  });
};
