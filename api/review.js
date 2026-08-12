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
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

async function fetchText(url, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/139 Safari/537.36',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
        accept: 'text/html,application/xhtml+xml'
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
    const needle = w.toLowerCase();
    let i = 0, c = 0;
    while ((i = lower.indexOf(needle, i)) !== -1) {
      c += 1;
      i += Math.max(needle.length, 1);
    }
    return sum + c;
  }, 0);
}

function placeVariants(place) {
  const p = clean(place, 120)
    .replace(/[()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const out = [p];

  if (/^c27\b/i.test(p) || /c\s*27/i.test(p)) {
    if (/마시란|마시안|영종/i.test(p)) {
      out.push('C27 다운타운 영종도', 'C27 다운타운 마시란점', 'C27 다운타운');
    }
  }

  const withoutBranch = p.replace(/\s*(본점|[가-힣A-Za-z0-9]+점)\s*$/u, '').trim();
  if (withoutBranch && withoutBranch !== p) out.push(withoutBranch);
  return [...new Set(out.filter(Boolean))].slice(0, 4);
}

function placeTokens(place) {
  return clean(place, 120)
    .replace(/[()（）]/g, ' ')
    .split(/\s+/)
    .map(x => x.replace(/[^가-힣A-Za-z0-9]/g, ''))
    .filter(x => x.length >= 2 && !/^(카페|식당|본점|지점|매장)$/i.test(x));
}

function relevanceScore(text, place) {
  const lower = String(text || '').toLowerCase();
  const tokens = placeTokens(place);
  if (!tokens.length) return 0;
  return tokens.reduce((s, t) => s + (lower.includes(t.toLowerCase()) ? 1 : 0), 0) / tokens.length;
}

function absoluteUrl(href, base) {
  try { return new URL(href, base).toString(); } catch (_) { return ''; }
}

async function researchDiningCode(place) {
  for (const q of placeVariants(place)) {
    try {
      const listUrl = `https://www.diningcode.com/list.dc?query=${encodeURIComponent(q)}`;
      const listHtml = await fetchText(listUrl, 4500);
      const matches = [...listHtml.matchAll(/href=["']([^"']*profile\.php\?rid=[^"'#& ]+)/gi)]
        .map(m => absoluteUrl(m[1], 'https://www.diningcode.com/'))
        .filter(Boolean);
      const urls = [...new Set(matches)].slice(0, 3);
      if (!urls.length) continue;

      let best = null;
      for (const url of urls) {
        try {
          const html = await fetchText(url, 4500);
          const text = htmlToText(html).slice(0, 120000);
          const score = Math.max(relevanceScore(text, place), relevanceScore(text, q));
          if (!best || score > best.score) best = { url, text, score };
        } catch (_) {}
      }
      if (best && best.score >= 0.34) {
        return {
          name: '다이닝코드 방문자 리뷰',
          url: best.url,
          text: best.text,
          weight: 1.35
        };
      }
    } catch (_) {}
  }
  return null;
}

async function researchNaver(place) {
  const q = `${place} 후기 리뷰`;
  const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(q)}`;
  try {
    const html = await fetchText(url, 4500);
    const text = htmlToText(html).slice(0, 100000);
    if (text.length < 300 || relevanceScore(text, place) < 0.34) return null;
    return { name: '네이버 블로그 검색', url, text, weight: 0.8 };
  } catch (_) {
    return null;
  }
}

async function researchDaum(place) {
  const q = `${place} 후기 리뷰`;
  const url = `https://search.daum.net/search?w=blog&q=${encodeURIComponent(q)}`;
  try {
    const html = await fetchText(url, 4500);
    const text = htmlToText(html).slice(0, 90000);
    if (text.length < 300 || relevanceScore(text, place) < 0.34) return null;
    return { name: '다음 블로그 검색', url, text, weight: 0.65 };
  } catch (_) {
    return null;
  }
}

const FEATURE_DEFS = [
  { key: 'ocean', label: '오션뷰·바다 전망', words: ['오션뷰', '바다', '해변', '일몰', '선셋', '전망', '뷰'] },
  { key: 'space', label: '넓은 공간·여러 층', words: ['대형카페', '대형 카페', '넓', '여러층', '여러 층', '층마다', '루프탑', '4층', '5층'] },
  { key: 'interior', label: '층별 인테리어·테마', words: ['인테리어', '테마', '컨셉', '콘셉트', '예쁜', '포토존', '뉴욕', '런던', '파리', '스페인'] },
  { key: 'parking', label: '주차 편의', words: ['무료주차', '무료 주차', '주차장', '주차', '전용주차'] },
  { key: 'quiet', label: '여유롭고 편안한 분위기', words: ['조용', '여유', '편안', '한적'] },
  { key: 'terrace', label: '테라스·야외 공간', words: ['테라스', '야외좌석', '야외 좌석', '야외공간', '루프탑'] },
  { key: 'dessert', label: '치즈케이크·디저트', words: ['치즈케이크', '치즈 케이크', '디저트', '베이커리', '도넛', '케이크'] },
  { key: 'coffee', label: '커피 메뉴', words: ['아메리카노', '커피', '라떼', '에스프레소'] },
  { key: 'bread', label: '빵·베이커리 메뉴', words: ['빵', '브레드', '소금빵', '크림치즈', '베이커리'] },
  { key: 'photo', label: '사진 찍기 좋은 공간', words: ['사진', '포토존', '사진찍', '인생샷'] },
  { key: 'price', label: '가격대가 있다는 의견', words: ['비싸', '가격대', '가격이 조금', '뷰값', '관광지 가격'] }
];

function extractFeatures(sources) {
  const scores = new Map();
  for (const d of FEATURE_DEFS) scores.set(d.key, { ...d, score: 0, sourceHits: 0 });

  for (const src of sources) {
    for (const d of FEATURE_DEFS) {
      const raw = countMatches(src.text, d.words);
      if (!raw) continue;
      const item = scores.get(d.key);
      item.score += Math.min(raw, 12) * (src.weight || 1);
      item.sourceHits += 1;
    }
  }

  return [...scores.values()]
    .filter(x => x.score >= 1.4 && (x.sourceHits >= 2 || x.score >= 3))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ key, label, score, sourceHits }) => ({ key, label, score, sourceHits }));
}

function menuKeywords(menu) {
  return clean(menu, 220)
    .split(/[,/·]+/)
    .map(s => s.replace(/\b\d+[\d,]*\s*원?\b/g, '').trim())
    .filter(s => s.length >= 2)
    .slice(0, 6);
}

function extractMenuMentions(sources, menu) {
  const out = [];
  for (const item of menuKeywords(menu)) {
    const needle = item.toLowerCase();
    let mentions = 0;
    for (const src of sources) {
      const lower = src.text.toLowerCase();
      if (lower.includes(needle)) mentions += 1;
    }
    if (mentions) out.push({ menu: item, mentions });
  }
  return out.sort((a, b) => b.mentions - a.mentions).slice(0, 3);
}

async function researchPlace(place, menu) {
  const settled = await Promise.allSettled([
    researchDiningCode(place),
    researchNaver(place),
    researchDaum(place)
  ]);
  const sources = settled
    .filter(x => x.status === 'fulfilled' && x.value)
    .map(x => x.value);
  const features = extractFeatures(sources);
  const menuMentions = extractMenuMentions(sources, menu);
  return { researched: features.length > 0, features, menuMentions, sources };
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

function publicReviewSentences(features, length) {
  const keys = new Set(features.map(f => f.key));
  const pool = [];

  if (keys.has('ocean')) pool.push('바다 쪽 전망이 시원해서 커피 마시면서 여유롭게 시간 보내기 좋았어요.');
  if (keys.has('space') && keys.has('interior')) pool.push('층마다 분위기와 콘셉트가 달라서 구경하는 재미도 있고 공간이 넓어 답답하지 않았어요.');
  else if (keys.has('space')) pool.push('공간이 넓고 여러 층으로 되어 있어서 자리 고르기도 편하고 둘러보는 재미가 있었어요.');
  else if (keys.has('interior')) pool.push('공간마다 분위기가 조금씩 달라 사진 찍고 구경하는 재미도 있었어요.');
  if (keys.has('parking')) pool.push('주차 공간이 있어 차로 방문하기에도 편했어요.');
  if (keys.has('quiet')) pool.push('대형 카페인데도 비교적 여유롭고 편하게 쉬기 좋은 분위기였어요.');
  if (keys.has('terrace')) pool.push('야외 공간도 있어서 날씨 좋은 날에는 바깥에서 쉬기 좋아 보여요.');
  if (keys.has('dessert')) pool.push('디저트 종류가 다양해서 커피랑 같이 고르는 재미도 있었어요.');
  if (keys.has('photo')) pool.push('사진 찍기 좋은 포인트가 많아서 구경하면서 시간 보내기 좋았어요.');

  if (!pool.length) return [];
  const first = pick(pool);
  if (length !== '보통' || pool.length < 2) return [first];
  const rest = pool.filter(x => x !== first);
  return [first, pick(rest)];
}

function priceSentence(features) {
  const item = features.find(f => f.key === 'price');
  if (!item || item.score < 3.5) return '';
  return '가격대는 조금 있는 편이지만 공간이나 분위기까지 생각하면 한 번쯤 들르기 괜찮았어요.';
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

  const researched = publicReviewSentences(features || [], length);
  for (const sentence of researched) {
    if (length === '아주 짧게' && parts.length >= 2) break;
    parts.push(sentence);
  }

  if (length === '보통' && !note) {
    const ps = priceSentence(features || []);
    if (ps) parts.push(ps);
  }

  const closes = [
    `전체적으로 편하게 다녀오기 좋았어요.${em}`,
    `다음에 근처 가면 또 들르고 싶어요.${em}`,
    `부담 없이 들르기 좋은 곳이었어요.${em}`
  ];

  if (length === '아주 짧게') return parts.slice(0, 2).join(' ').trim();
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

  let research = { researched: false, features: [], menuMentions: [], sources: [] };
  try {
    research = await researchPlace(place, menu);
  } catch (_) {
    // 공개 후기 검색이 실패해도 사용자가 입력한 내용으로 리뷰는 만들 수 있게 한다.
  }

  const review = buildReview({
    place, menu, note, length, tone, emoji,
    features: research.features
  });

  return res.status(200).json({
    review,
    researched: research.researched,
    features: research.features.map(f => f.label),
    menuMentions: research.menuMentions,
    sources: research.sources.map(s => ({ name: s.name, url: s.url }))
  });
};
