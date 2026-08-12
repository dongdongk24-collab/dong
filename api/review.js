function clean(v, max = 500) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decodeHtml(s) {
  return s
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
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SimpleReviewMaker/1.0)',
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
  const lower = text.toLowerCase();
  return words.reduce((sum, w) => {
    const needle = w.toLowerCase();
    let i = 0, c = 0;
    while ((i = lower.indexOf(needle, i)) !== -1) {
      c += 1;
      i += Math.max(needle.length, 1);
    }
    return sum + c;
  }, 0);
}

function extractFeatures(text) {
  const defs = [
    { key: 'ocean', label: '오션뷰·바다 전망', words: ['오션뷰', '바다', '해변', '일몰', '전망', '뷰'] },
    { key: 'space', label: '넓은 공간·여러 층', words: ['대형카페', '대형 카페', '넓', '여러층', '여러 층', '층마다', '4층', '루프탑'] },
    { key: 'interior', label: '인테리어·테마', words: ['인테리어', '테마', '컨셉', '예쁜', '포토존'] },
    { key: 'parking', label: '주차 편의', words: ['무료주차', '무료 주차', '주차장', '주차'] },
    { key: 'quiet', label: '편안한 분위기', words: ['조용', '여유', '편안'] },
    { key: 'terrace', label: '테라스·야외 공간', words: ['테라스', '야외좌석', '야외 좌석', '야외공간'] },
    { key: 'dessert', label: '디저트·치즈케이크', words: ['치즈케이크', '치즈 케이크', '디저트', '베이커리', '도넛'] },
    { key: 'coffee', label: '커피', words: ['아메리카노', '커피', '라떼'] }
  ];
  return defs
    .map(d => ({ ...d, score: countMatches(text, d.words) }))
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ key, label, score }) => ({ key, label, score }));
}

async function researchPlace(place) {
  const queryUrl = `https://www.diningcode.com/list.dc?query=${encodeURIComponent(place)}`;
  const listHtml = await fetchText(queryUrl);
  const profileMatch = listHtml.match(/(?:href=["'])([^"']*profile\.php\?rid=[^"'#& ]+)/i)
    || listHtml.match(/(https?:\/\/www\.diningcode\.com\/profile\.php\?rid=[^"'#& ]+)/i);

  if (!profileMatch) {
    return { researched: false, features: [], source: null };
  }

  let profileUrl = profileMatch[1] || profileMatch[0];
  if (profileUrl.startsWith('/')) profileUrl = `https://www.diningcode.com${profileUrl}`;
  if (!profileUrl.startsWith('http')) profileUrl = `https://www.diningcode.com/${profileUrl.replace(/^\//, '')}`;

  const profileHtml = await fetchText(profileUrl);
  const text = htmlToText(profileHtml).slice(0, 90000);
  const features = extractFeatures(text);

  return {
    researched: features.length > 0,
    features,
    source: { name: '다이닝코드', url: profileUrl }
  };
}

function noteToSentence(note) {
  if (!note) return '';
  let t = note.replace(/[.!?]+$/, '').trim();
  const reps = [
    [/맛있었음$/, '맛있었어요'], [/좋았음$/, '좋았어요'], [/괜찮았음$/, '괜찮았어요'],
    [/편했음$/, '편했어요'], [/넓었음$/, '넓었어요'], [/아쉬웠음$/, '아쉬웠어요'],
    [/했음$/, '했어요'], [/였음$/, '였어요']
  ];
  for (const [r, v] of reps) {
    if (r.test(t)) { t = t.replace(r, v); break; }
  }
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function researchedSentence(features) {
  const keys = new Set(features.map(f => f.key));
  const pool = [];
  if (keys.has('ocean')) pool.push('바다 보면서 쉬기 좋은 분위기라 여유롭게 시간 보내기 좋았어요.');
  if (keys.has('space')) pool.push('공간이 넓고 층마다 둘러보는 재미가 있어서 답답하지 않게 쉬기 좋았어요.');
  if (keys.has('interior')) pool.push('공간마다 분위기가 조금씩 달라 구경하는 재미도 있었어요.');
  if (keys.has('parking')) pool.push('주차할 수 있는 공간이 있어서 차로 방문하기에도 편한 편이었어요.');
  if (keys.has('terrace')) pool.push('야외 공간도 함께 즐길 수 있어서 날씨 좋을 때 들르기 좋아 보여요.');
  if (keys.has('quiet')) pool.push('편하게 앉아 쉬면서 이야기 나누기 좋은 분위기였어요.');
  return pool.length ? pick(pool) : '';
}

function buildReview({ place, menu, note, length, tone, emoji, features }) {
  const em = emoji ? (tone === '밝게' ? pick([' 😊', ' ✨', ' 👍']) : pick(['', ' 😊'])) : '';
  const openings = tone === '담백하게'
    ? [`${place}에 다녀왔어요.`, `${place} 방문했습니다.`]
    : tone === '밝게'
      ? [`${place} 다녀왔어요!${em}`, `${place} 방문했는데 기분 좋게 다녀왔어요!${em}`]
      : [`${place} 다녀왔어요!`, `${place} 방문했어요.`];

  const parts = [pick(openings)];
  if (menu) {
    parts.push(pick([
      `${menu} 주문해서 먹었어요.`,
      `이번에는 ${menu}로 주문했어요.`,
      `${menu} 먹어봤어요.`
    ]));
  }
  const ns = noteToSentence(note);
  if (ns) parts.push(ns);

  const rs = researchedSentence(features || []);
  if (rs && (length !== '아주 짧게' || !note)) parts.push(rs);

  const closes = [
    `전체적으로 편하게 다녀오기 좋았어요.${em}`,
    `다음에 근처 가면 또 들르고 싶어요.${em}`,
    `부담 없이 들르기 좋은 곳이었어요.${em}`
  ];

  if (length === '아주 짧게') {
    return parts.slice(0, 2).join(' ').trim();
  }
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

  let research = { researched: false, features: [], source: null };
  try {
    research = await researchPlace(place);
  } catch (e) {
    // 검색 실패 시에도 리뷰 생성 자체는 계속 동작하게 한다.
  }

  const review = buildReview({ place, menu, note, length, tone, emoji, features: research.features });
  return res.status(200).json({
    review,
    researched: research.researched,
    features: research.features.map(f => f.label),
    source: research.source
  });
};
