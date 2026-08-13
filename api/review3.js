const baseHandler = require('./review2');

function clean(v, max = 1000) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeHtml(String(html || '').replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();
}

async function fetchText(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { headers:{'user-agent':'Mozilla/5.0 (compatible; SimpleReviewMaker/1.5)','accept-language':'ko-KR,ko;q=0.9,en;q=0.5'}, signal:controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

function captureBase(req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      setHeader(){ return this; },
      status(code){ statusCode = code; return this; },
      json(payload){ resolve({statusCode,payload}); return this; },
      send(payload){ resolve({statusCode,payload}); return this; },
      end(payload){ resolve({statusCode,payload}); return this; }
    };
    Promise.resolve(baseHandler(req,res)).catch(reject);
  });
}

function count(text, re) {
  const m = String(text || '').match(re);
  return m ? m.length : 0;
}

function reviewSection(text) {
  const t = String(text || '');
  let start = t.indexOf('방문자 리뷰');
  if (start < 0) start = t.indexOf('리뷰');
  let end = t.indexOf('비슷한 맛집', Math.max(0,start));
  if (end < 0) end = Math.min(t.length, Math.max(0,start) + 42000);
  return t.slice(Math.max(0,start), end);
}

function extractClaims(text, menu) {
  const t = reviewSection(text);
  const menuText = String(menu || '');
  const claims = [];
  const add = (key,label,score) => { if (score>0 && !claims.some(x=>x.key===key)) claims.push({key,label,score}); };

  add('cleanTaste','깔끔한 맛·국물',count(t,/깔끔(?:하|한|하게)?|개운/gi));
  add('deepSoup','진한 국물',count(t,/국물[^.!?]{0,22}진하|진한[^.!?]{0,14}국물/gi));
  add('softChewyMeat','부드럽고 쫄깃한 고기',count(t,/고기[^.!?]{0,35}(?:부드럽|쫄깃)|(?:부드럽|쫄깃)[^.!?]{0,35}고기/gi));
  add('plentiful','푸짐한 양',count(t,/푸짐|양(?:도|이)?\s*(?:많|넉넉)|건더기[^.!?]{0,15}(?:많|실하)/gi));
  add('noSmell','잡내 없이 깔끔함',count(t,/잡내[^.!?]{0,12}(?:없|안 나)/gi));
  add('spicy','매콤한 맛',count(t,/매콤|칼칼|얼큰/gi));
  add('sweet','달콤한 맛',count(t,/달콤|달달|단맛/gi));
  add('savory','고소한 맛',count(t,/고소/gi));
  add('mild','담백한 맛',count(t,/담백/gi));
  add('chewy','쫄깃·쫀득한 식감',count(t,/쫄깃|쫀득/gi));
  add('crispy','바삭한 식감',count(t,/바삭/gi));
  add('fresh','신선한 재료',count(t,/신선|싱싱/gi));
  add('riceCake','쌀떡',count(t,/쌀떡/gi));
  add('wheatCake','밀떡',count(t,/밀떡/gi));
  add('sauce','양념 맛',count(t,/양념[^.!?]{0,18}(?:맛|잘|진|매콤|달콤)/gi));
  add('parking','무료주차·주차 편의',count(t,/무료주차|주차[^.!?]{0,18}(?:편|가능|무료)/gi));
  add('selfBar','셀프코너 구성',count(t,/셀프코너|셀프바/gi));
  add('wait','웨이팅·대기',count(t,/웨이팅|대기|기다/gi));

  for (const item of menuText.split(/[,/·|]+/).map(x=>x.trim()).filter(x=>x.length>=2)) {
    const i = t.indexOf(item);
    if (i >= 0) {
      const w = t.slice(Math.max(0,i-220), Math.min(t.length,i+item.length+300));
      for (const c of claims) {
        const map = {
          cleanTaste:/깔끔|개운/i, deepSoup:/진하|진한/i, softChewyMeat:/부드럽|쫄깃/i,
          plentiful:/푸짐|양이 많|양도 많|넉넉|건더기/i, noSmell:/잡내/i, spicy:/매콤|칼칼|얼큰/i,
          sweet:/달콤|달달|단맛/i, savory:/고소/i, mild:/담백/i, chewy:/쫄깃|쫀득/i,
          crispy:/바삭/i, fresh:/신선|싱싱/i, riceCake:/쌀떡/i, wheatCake:/밀떡/i, sauce:/양념/i
        };
        if (map[c.key] && map[c.key].test(w)) c.score += 4;
      }
    }
  }
  return claims.sort((a,b)=>b.score-a.score).slice(0,8);
}

function exactTasteSentences(claims, menu, length='짧게') {
  const keys = new Set((claims||[]).map(x=>x.key));
  const m = String(menu || '');
  const out = [];
  if (/순대국|국밥|해장국/.test(m)) {
    if (keys.has('cleanTaste') && keys.has('deepSoup')) out.push('국물은 깔끔하면서도 진한 편이라 든든하게 먹기 좋았어요.');
    else if (keys.has('deepSoup')) out.push('국물 맛이 진한 편이라 든든하게 먹기 좋았어요.');
    else if (keys.has('cleanTaste')) out.push('국물이 텁텁하지 않고 깔끔하게 넘어가서 좋았어요.');
    if (keys.has('softChewyMeat')) out.push('고기는 부드러우면서도 쫄깃한 식감이 살아 있어서 좋았어요.');
    else if (keys.has('noSmell')) out.push('고기나 내장도 잡내 없이 깔끔하게 먹기 좋았어요.');
    if (keys.has('plentiful') && length==='보통') out.push('건더기와 양도 푸짐해서 한 그릇 먹고 나니 든든했어요.');
  } else if (/떡볶이/.test(m)) {
    const style = keys.has('riceCake') ? '쌀떡' : keys.has('wheatCake') ? '밀떡' : '떡';
    if (keys.has('spicy') && keys.has('sweet')) out.push(`양념은 매콤달콤한 편이고 ${style}에 잘 배어 있어서 계속 손이 갔어요.`);
    else if (keys.has('spicy')) out.push(`양념은 매콤한 맛이 잘 살아 있고 ${style}과도 잘 어울렸어요.`);
    else if (keys.has('sweet')) out.push('양념은 달콤한 맛이 도는 편이라 부담 없이 먹기 좋았어요.');
    if (keys.has('chewy')) out.push(`${style}은 쫄깃한 식감이 살아 있어서 씹는 맛이 좋았어요.`);
    if (keys.has('crispy') && /튀김/.test(m)) out.push('튀김은 바삭한 식감이 살아 있어서 떡볶이와 같이 먹기 좋았어요.');
  } else {
    const taste = [];
    if (keys.has('savory')) taste.push('고소한 맛');
    if (keys.has('mild')) taste.push('담백한 맛');
    if (keys.has('spicy')) taste.push('매콤한 맛');
    if (keys.has('sweet')) taste.push('달콤한 맛');
    if (keys.has('cleanTaste')) taste.push('깔끔한 맛');
    if (taste.length) out.push(`음식은 ${taste.slice(0,2).join('과 ')}이 잘 느껴져서 맛있게 먹었어요.`);
    if (keys.has('chewy')) out.push('쫄깃한 식감도 잘 살아 있어서 씹는 맛이 좋았어요.');
    else if (keys.has('crispy')) out.push('바삭한 식감이 살아 있어서 더 맛있게 먹었어요.');
  }
  return out.slice(0, length==='보통'?3:2);
}

function splitSentences(text) {
  return clean(text,3000).split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
}

function refineReview(review, exactSentences, length) {
  let parts = splitSentences(review);
  const generic = /(간과 풍미가 잘 살아|한 끼 식사로 만족|음식 맛이 좋다는 후기|전체적으로 간|국물이나 육수 맛도 깔끔하게 잘 어울|재료가 신선한 느낌)/;
  parts = parts.filter(s => !generic.test(s));
  if (exactSentences.length) {
    const close = /(전체적으로|다음에|또 방문|또 들르|만족스럽게 식사)/;
    let idx = parts.findIndex((s,i)=>i>0 && close.test(s));
    if (idx < 0) idx = parts.length;
    for (const s of exactSentences) {
      if (!parts.some(x=>x.includes(s.replace(/[.!?]+$/,'')))) parts.splice(idx++,0,s);
    }
  }
  if (length==='아주 짧게' && parts.length>3) parts = parts.slice(0,3);
  return parts.join(' ').replace(/\s+/g,' ').trim();
}

function safeProfileUrl(url) {
  const s = clean(url,300);
  return /^https:\/\/www\.diningcode\.com\/profile\.php\?rid=[A-Za-z0-9_-]+$/.test(s) ? s : '';
}

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method!=='POST') return res.status(405).json({error:'POST only'});
  try {
    const captured = await captureBase(req);
    let result = captured.payload && typeof captured.payload==='object' ? {...captured.payload} : captured.payload;
    if (!result || captured.statusCode >= 400) return res.status(captured.statusCode||500).json(result);

    const profileUrl = safeProfileUrl(req.body?.placeProfileUrl);
    const address = clean(req.body?.placeAddress,160);
    if (!profileUrl) return res.status(captured.statusCode||200).json(result);

    const html = await fetchText(profileUrl,6500);
    const text = htmlToText(html).slice(0,100000);
    const claims = extractClaims(text, req.body?.menu || '');
    const exactSentences = exactTasteSentences(claims, req.body?.menu || '', clean(req.body?.length,20)||'짧게');
    result.review = refineReview(result.review || '', exactSentences, clean(req.body?.length,20)||'짧게');
    result.researched = true;
    result.exactSource = true;
    result.selectedPlace = { name:clean(req.body?.place,100), address, profileUrl };
    result.exactClaims = claims.map(x=>x.label);
    result.features = claims.slice(0,6).map(x=>x.label);
    result.sources = [{name:'다이닝코드 선택 매장',url:profileUrl}];
    return res.status(200).json(result);
  } catch (e) {
    try {
      const captured = await captureBase(req);
      return res.status(captured.statusCode||200).json(captured.payload);
    } catch (_) {
      return res.status(500).json({error:'리뷰 생성 중 오류가 발생했습니다.'});
    }
  }
};
