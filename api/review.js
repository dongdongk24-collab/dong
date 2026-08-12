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
        'user-agent': 'Mozilla/5.0 (compatible; SimpleReviewMaker/1.3)',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6'
      },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}

function countMatches(text, words) {
  const lower = String(text || '').toLowerCase();
  return words.reduce((sum, w) => {
    const needle = String(w).toLowerCase();
    if (!needle) return sum;
    let i = 0, c = 0;
    while ((i = lower.indexOf(needle, i)) !== -1) { c += 1; i += Math.max(needle.length, 1); }
    return sum + c;
  }, 0);
}

function normalizeForMatch(s) {
  return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
    .replace(/[^가-힣a-z0-9]+/g, ' ').replace(/\b(본점|지점|점|매장)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function placeTokens(place) {
  return normalizeForMatch(place).split(' ').filter(x => x.length >= 2 || /\d/.test(x));
}

function relevanceScore(place, text) {
  const tokens = placeTokens(place);
  if (!tokens.length) return 0;
  const hay = normalizeForMatch(text);
  return tokens.filter(t => hay.includes(t)).length / tokens.length;
}

function inferCategory(place, menu, researchText) {
  const p = String(place || ''), m = String(menu || ''), r = String(researchText || '');
  const defs = [
    { key:'cafe', label:'카페', words:['카페','커피','아메리카노','라떼','에이드','스무디','케이크','베이커리','디저트','브런치','크로플','빵','티라미수','마들렌'] },
    { key:'korean', label:'한식 음식점', words:['한식','백반','국밥','찌개','전골','불고기','갈비','삼겹살','곱창','막창','냉면','보쌈','족발','순대','제육','비빔밥','칼국수','수제비'] },
    { key:'japanese', label:'일식 음식점', words:['일식','초밥','스시','사시미','돈까스','돈카츠','라멘','우동','소바','규동','덮밥','이자카야','히츠마부시'] },
    { key:'chinese', label:'중식 음식점', words:['중식','짜장','짜장면','짬뽕','탕수육','마라','양꼬치','훠궈'] },
    { key:'western', label:'양식 음식점', words:['양식','파스타','피자','스테이크','리조또','라자냐','샐러드'] },
    { key:'bar', label:'주점', words:['술집','주점','포차','호프','맥주','소주','하이볼','와인바','이자카야'] },
    { key:'restaurant', label:'음식점', words:['식당','음식점','맛집','메뉴','식사','반찬','고기','국물','밥','면','튀김','구이','볶음'] }
  ];
  const scored = defs.map(d => ({...d, score:countMatches(p,d.words)*4 + countMatches(m,d.words)*8 + countMatches(r.slice(0,45000),d.words)})).sort((a,b)=>b.score-a.score);
  const top = scored[0];
  if (!top || top.score <= 0) return { key:'restaurant', label:'음식점', score:0 };
  const cafe = scored.find(x=>x.key==='cafe');
  const restaurantLike = scored.filter(x=>['korean','japanese','chinese','western','bar','restaurant'].includes(x.key))[0];
  if (restaurantLike && restaurantLike.score >= 8 && cafe && cafe.score < restaurantLike.score * 1.4) return restaurantLike;
  return top;
}

function featureDefsFor(categoryKey) {
  const common = [
    {key:'parking',label:'주차 편의',words:['무료주차','무료 주차','주차장','주차']},
    {key:'friendly',label:'친절한 응대',words:['친절','응대가 좋','서비스가 좋']},
    {key:'value',label:'가성비',words:['가성비','가격이 괜찮','가격 괜찮']},
    {key:'wait',label:'웨이팅·대기',words:['웨이팅','대기','기다']},
    {key:'clean',label:'깔끔함',words:['깔끔','청결','깨끗']},
    {key:'revisit',label:'재방문 언급',words:['재방문','또 방문','다시 방문','또 가고']}
  ];
  if (categoryKey === 'cafe') return common.concat([
    {key:'ocean',label:'오션뷰·바다 전망',words:['오션뷰','바다','해변','일몰','전망','뷰']},
    {key:'space',label:'넓은 공간·여러 층',words:['대형카페','대형 카페','넓','여러층','여러 층','층마다','루프탑']},
    {key:'interior',label:'인테리어·포토존',words:['인테리어','테마','컨셉','예쁜','포토존']},
    {key:'quiet',label:'편안한 분위기',words:['조용','여유','편안']},
    {key:'terrace',label:'테라스·야외 공간',words:['테라스','야외좌석','야외 좌석','야외공간']},
    {key:'dessert',label:'디저트',words:['치즈케이크','케이크','디저트','베이커리','도넛','빵']},
    {key:'coffee',label:'커피',words:['아메리카노','커피','라떼','원두']}
  ]);
  return common.concat([
    {key:'flavor',label:'음식 맛',words:['맛있','맛이 좋','간이 좋','풍미','고소','담백','매콤','칼칼','감칠맛','짭짤','달콤']},
    {key:'portion',label:'양이 넉넉함',words:['양이 많','푸짐','양 많','넉넉']},
    {key:'side',label:'반찬·구성',words:['반찬','밑반찬','찬이','구성 좋']},
    {key:'meat',label:'고기 상태',words:['고기','육질','잡내 없','부드럽','두툼']},
    {key:'soup',label:'국물·육수',words:['국물','육수','진하','깔끔한 국물']},
    {key:'fresh',label:'재료 신선도',words:['신선','재료가 좋','싱싱']},
    {key:'family',label:'가족 식사',words:['가족','부모님','아이와','가족모임']},
    {key:'solo',label:'혼밥 편의',words:['혼밥','혼자 먹','1인']},
    {key:'atmosphere',label:'식사 분위기',words:['분위기 좋','편하게 식사','식사하기 좋','깔끔한 분위기']}
  ]);
}

function extractFeatures(text, categoryKey) {
  return featureDefsFor(categoryKey).map(d=>({...d,score:countMatches(text,d.words)}))
    .filter(d=>d.score>0).sort((a,b)=>b.score-a.score).slice(0,6)
    .map(({key,label,score})=>({key,label,score}));
}

function splitMenus(menu) {
  return String(menu || '').split(/[,/·|]+/).map(x=>clean(x,60)).filter(x=>x.length>=2).slice(0,5);
}

const TASTE_DEFS = [
  {key:'고소', words:['고소','고소한']}, {key:'담백', words:['담백','담담한']},
  {key:'짭짤', words:['짭짤','짭조름']}, {key:'달콤', words:['달콤','달달']},
  {key:'매콤', words:['매콤','칼칼','얼큰']}, {key:'감칠맛', words:['감칠맛','감칠']},
  {key:'진한', words:['진한','진하','농후']}, {key:'깔끔', words:['깔끔한 맛','깔끔','개운']},
  {key:'부드러운', words:['부드럽','보들']}, {key:'쫄깃한', words:['쫄깃','쫀득']},
  {key:'바삭한', words:['바삭','바싹']}, {key:'촉촉한', words:['촉촉']},
  {key:'탱글한', words:['탱글']}, {key:'향긋한', words:['향긋','향이 좋']},
  {key:'새콤한', words:['새콤','산미']}, {key:'불향', words:['불향','불맛']}
];

function descriptorScores(text) {
  return TASTE_DEFS.map(d=>({key:d.key,score:countMatches(text,d.words)}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
}

function extractTasteDetails(text, menu) {
  const menus = splitMenus(menu);
  const lower = String(text || '').toLowerCase();
  const details = [];
  for (const item of menus) {
    const needles = [item, item.replace(/\s+/g,'')].filter(Boolean);
    let windows = '';
    for (const needle of needles) {
      const n = needle.toLowerCase();
      let idx = 0, hits = 0;
      while ((idx = lower.indexOf(n, idx)) !== -1 && hits < 10) {
        windows += ' ' + String(text).slice(Math.max(0,idx-140), Math.min(String(text).length,idx+n.length+180));
        idx += Math.max(n.length,1); hits++;
      }
    }
    const ds = descriptorScores(windows).slice(0,3).map(x=>x.key);
    if (ds.length) details.push({menu:item, descriptors:ds});
  }
  if (!details.length) {
    const global = descriptorScores(text).slice(0,3).map(x=>x.key);
    if (global.length) details.push({menu:'',descriptors:global});
  }
  return details;
}

async function diningCodeResearch(place) {
  const url = `https://www.diningcode.com/list.dc?query=${encodeURIComponent(place)}`;
  const listHtml = await fetchText(url);
  const m = listHtml.match(/(?:href=["'])([^"']*profile\.php\?rid=[^"'#& ]+)/i) || listHtml.match(/(https?:\/\/www\.diningcode\.com\/profile\.php\?rid=[^"'#& ]+)/i);
  if (!m) return null;
  let profileUrl = m[1] || m[0];
  if (profileUrl.startsWith('/')) profileUrl = `https://www.diningcode.com${profileUrl}`;
  if (!profileUrl.startsWith('http')) profileUrl = `https://www.diningcode.com/${profileUrl.replace(/^\//,'')}`;
  const text = htmlToText(await fetchText(profileUrl)).slice(0,100000);
  return {name:'다이닝코드',url:profileUrl,text,relevance:relevanceScore(place,text.slice(0,12000))};
}

async function naverSnippetResearch(place, menu='') {
  const q = `${place} ${menu ? menu + ' ' : ''}후기`;
  const url = `https://search.naver.com/search.naver?where=view&query=${encodeURIComponent(q)}`;
  const text = htmlToText(await fetchText(url,5000)).slice(0,70000);
  return {name:'네이버 검색',url,text,relevance:relevanceScore(place,text.slice(0,15000))};
}

async function daumSnippetResearch(place, menu='') {
  const q = `${place} ${menu ? menu + ' ' : ''}후기`;
  const url = `https://search.daum.net/search?w=blog&q=${encodeURIComponent(q)}`;
  const text = htmlToText(await fetchText(url,5000)).slice(0,70000);
  return {name:'다음 검색',url,text,relevance:relevanceScore(place,text.slice(0,15000))};
}

async function researchPlace(place, menu) {
  const menuQuery = splitMenus(menu).slice(0,2).join(' ');
  const jobs = [diningCodeResearch(place), naverSnippetResearch(place,menuQuery), daumSnippetResearch(place,menuQuery)];
  const settled = await Promise.allSettled(jobs);
  let sources = settled.filter(x=>x.status==='fulfilled'&&x.value&&x.value.text).map(x=>x.value)
    .filter(x=>x.relevance>=0.34 || placeTokens(place).length<=1);
  if (!sources.length) {
    const retry = await Promise.allSettled([naverSnippetResearch(place,''),daumSnippetResearch(place,'')]);
    sources = retry.filter(x=>x.status==='fulfilled'&&x.value&&x.value.text).map(x=>x.value)
      .filter(x=>x.relevance>=0.34 || placeTokens(place).length<=1);
  }
  const combined = sources.map(s=>s.text).join(' ');
  const category = inferCategory(place,menu,combined);
  const features = extractFeatures(combined,category.key);
  const tasteDetails = extractTasteDetails(combined,menu);
  return {researched:sources.length>0&&(features.length>0||tasteDetails.length>0),category,features,tasteDetails,sources:sources.map(s=>({name:s.name,url:s.url}))};
}

function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

function naturalizeFact(text) {
  let t = clean(text,220).replace(/["'“”‘’]/g,'').replace(/[.!?]+$/,'').trim();
  if (!t) return '';
  const reps = [[/맛있었음$/,'맛있었어요'],[/좋았음$/,'좋았어요'],[/괜찮았음$/,'괜찮았어요'],[/편했음$/,'편했어요'],[/했음$/,'했어요'],[/였음$/,'였어요']];
  for (const [r,v] of reps) if (r.test(t)) { t=t.replace(r,v); break; }
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

function parseInstruction(note, categoryKey, menu) {
  const raw = clean(note,500), lower = raw.toLowerCase(), exclude = new Set();
  const exclusionRules = [
    ['parking',/주차.{0,10}(빼|제외|언급하지|쓰지|넣지)/],['friendly',/(친절|서비스).{0,10}(빼|제외|언급하지|쓰지|넣지)/],
    ['value',/(가성비|가격).{0,10}(빼|제외|언급하지|쓰지|넣지)/],['wait',/(웨이팅|대기).{0,10}(빼|제외|언급하지|쓰지|넣지)/],
    ['clean',/(깔끔|청결|깨끗).{0,10}(빼|제외|언급하지|쓰지|넣지)/],['ocean',/(바다|오션뷰|전망|뷰).{0,10}(빼|제외|언급하지|쓰지|넣지)/],
    ['interior',/(인테리어|포토존).{0,10}(빼|제외|언급하지|쓰지|넣지)/],['atmosphere',/분위기.{0,10}(빼|제외|언급하지|쓰지|넣지)/],
    ['flavor',/(맛|음식).{0,10}(빼|제외|언급하지|쓰지|넣지)/],['portion',/(양|푸짐).{0,10}(빼|제외|언급하지|쓰지|넣지)/]
  ];
  exclusionRules.forEach(([key,re])=>{if(re.test(lower))exclude.add(key)});

  const detail = /(자세|세부|구체|상세|디테일)/.test(lower);
  let focus='';
  if (/(음식|메뉴|맛|식사)/.test(lower) && (detail || /(위주|중심|많이|강조|집중)/.test(lower))) focus='food';
  else if (/(분위기|인테리어|뷰|공간)/.test(lower) && (detail || /(위주|중심|많이|강조|집중)/.test(lower))) focus='atmosphere';
  else if (/(서비스|친절)/.test(lower) && (detail || /(위주|중심|많이|강조|집중)/.test(lower))) focus='service';

  const instructionLike = /(해줘|해주세요|써줘|작성해|적어줘|넣어줘|빼줘|제외|위주|중심|자세|세부|구체|상세|강조|반영)/.test(lower);
  let customSentence='';
  const isCafe = categoryKey==='cafe';

  if (raw && !/(빼|제외|언급하지|쓰지|넣지)/.test(lower)) {
    if (/친절/.test(lower) && !focus) customSentence = isCafe ? '직원분들도 친절해서 기분 좋게 이용했어요.' : '직원분들도 친절해서 기분 좋게 식사했어요.';
    else if (/(깔끔|깨끗|청결)/.test(lower) && !focus) customSentence = isCafe ? '매장도 깔끔해서 편하게 머물기 좋았어요.' : '매장도 깔끔해서 편하게 식사하기 좋았어요.';
    else if (/(양이 많|양 많|푸짐|넉넉)/.test(lower) && !focus) customSentence = '양도 넉넉해서 든든하게 먹기 좋았어요.';
    else if (/(또 가|재방문|다시 가)/.test(lower) && !focus) customSentence = isCafe ? '다음에 근처 오면 또 들르고 싶어요.' : '다음에 근처 오면 다른 메뉴도 먹어보고 싶어요.';
    else if (!instructionLike) customSentence = naturalizeFact(raw);
  }
  return {exclude,focus,detail,customSentence,instructionLike};
}

function researchedSentences(features, categoryKey) {
  const keys = new Set((features||[]).map(f=>f.key)), pool=[];
  if (categoryKey==='cafe') {
    if(keys.has('ocean'))pool.push({key:'ocean',text:'바다 전망이 좋아 풍경까지 함께 즐기기 좋았어요.'});
    if(keys.has('space'))pool.push({key:'space',text:'공간이 넓어서 여유롭게 머물기 좋았어요.'});
    if(keys.has('interior'))pool.push({key:'interior',text:'인테리어도 눈에 띄어서 공간 구경하는 재미가 있었어요.'});
    if(keys.has('dessert'))pool.push({key:'dessert',text:'디저트와 함께 즐기기 좋은 구성이었어요.'});
    if(keys.has('parking'))pool.push({key:'parking',text:'주차도 편해서 차로 방문하기 괜찮았어요.'});
    if(keys.has('quiet'))pool.push({key:'quiet',text:'전체적으로 편안하게 쉬기 좋은 분위기였어요.'});
  } else {
    if(keys.has('flavor'))pool.push({key:'flavor',text:'전체적으로 간과 풍미가 잘 살아 있어서 맛있게 먹었어요.'});
    if(keys.has('portion'))pool.push({key:'portion',text:'양도 넉넉해서 든든하게 먹기 좋았어요.'});
    if(keys.has('side'))pool.push({key:'side',text:'반찬과 메뉴 구성이 잘 어울려 한 끼 식사로 만족스러웠어요.'});
    if(keys.has('meat'))pool.push({key:'meat',text:'고기 식감도 부담 없이 먹기 좋았어요.'});
    if(keys.has('soup'))pool.push({key:'soup',text:'국물이나 육수 맛도 깔끔하게 잘 어울렸어요.'});
    if(keys.has('fresh'))pool.push({key:'fresh',text:'재료가 신선한 느낌이라 전체적으로 깔끔하게 먹었어요.'});
    if(keys.has('parking'))pool.push({key:'parking',text:'주차도 편해서 차로 방문하기 괜찮았어요.'});
    if(keys.has('clean'))pool.push({key:'clean',text:'매장이 깔끔해서 편하게 식사하기 좋았어요.'});
    if(keys.has('friendly'))pool.push({key:'friendly',text:'직원분들도 친절해서 기분 좋게 식사했어요.'});
    if(keys.has('atmosphere'))pool.push({key:'atmosphere',text:'편하게 식사하기 좋은 분위기였어요.'});
  }
  return pool;
}

function joinDescriptors(ds) {
  if (!ds.length) return '';
  if (ds.length===1) return ds[0];
  if (ds.length===2) return `${ds[0]} 느낌과 ${ds[1]} 식감`;
  return `${ds[0]}, ${ds[1]}, ${ds[2]} 느낌`;
}

function detailedTasteSentence(tasteDetails, menu) {
  const ds = (tasteDetails||[]).filter(x=>x.descriptors&&x.descriptors.length);
  if (!ds.length) return '';
  const named = ds.filter(x=>x.menu).slice(0,2);
  if (named.length===1) return `${named[0].menu}는 ${joinDescriptors(named[0].descriptors.slice(0,2))}이 잘 살아 있어서 맛과 식감이 인상적이었어요.`;
  if (named.length>=2) return `${named[0].menu}는 ${joinDescriptors(named[0].descriptors.slice(0,2))}이 좋았고, ${named[1].menu}는 ${joinDescriptors(named[1].descriptors.slice(0,2))}이 잘 느껴져 각각 다른 매력이 있었어요.`;
  return `전체적으로 ${joinDescriptors(ds[0].descriptors.slice(0,3))}이 어우러져 맛의 특징이 분명했어요.`;
}

function buildReview({place,menu,note,length,tone,emoji,features,tasteDetails,category}) {
  const em = emoji ? (tone==='밝게'?pick([' 😊',' ✨',' 👍']):pick(['',' 😊'])) : '';
  const isCafe = category?.key==='cafe';
  const directive = parseInstruction(note,category?.key||'restaurant',menu);
  const openings = tone==='담백하게' ? [`${place}에 다녀왔어요.`,`${place} 방문했습니다.`]
    : tone==='밝게' ? [`${place} 다녀왔어요!${em}`,`${place} 방문했는데 기분 좋게 다녀왔어요!${em}`]
    : [`${place} 다녀왔어요!`,`${place} 방문했어요.`];
  const parts=[pick(openings)];
  if(menu) parts.push(isCafe?pick([`${menu} 주문해서 먹어봤어요.`,`이번에는 ${menu}로 주문했어요.`]):pick([`${menu} 주문해서 먹었어요.`,`이번에는 ${menu}로 주문했어요.`]));
  if(directive.customSentence) parts.push(directive.customSentence);

  if(directive.focus==='food' && directive.detail) {
    const s = detailedTasteSentence(tasteDetails,menu);
    if(s) parts.push(s);
  }

  let researchPool = researchedSentences(features||[],category?.key||'restaurant').filter(x=>!directive.exclude.has(x.key));
  if(directive.focus==='food') {
    const foodKeys=new Set(isCafe?['coffee','dessert']:['flavor','portion','side','meat','soup','fresh']);
    researchPool.sort((a,b)=>Number(foodKeys.has(b.key))-Number(foodKeys.has(a.key)));
  } else if(directive.focus==='atmosphere') {
    const ks=new Set(isCafe?['ocean','space','interior','quiet']:['atmosphere','clean','family']);
    researchPool.sort((a,b)=>Number(ks.has(b.key))-Number(ks.has(a.key)));
  } else if(directive.focus==='service') researchPool.sort((a,b)=>Number(b.key==='friendly')-Number(a.key==='friendly'));

  const alreadyDetailed = directive.focus==='food' && directive.detail && parts.some(x=>/맛과 식감|각각 다른 매력|맛의 특징/.test(x));
  if(researchPool.length && !alreadyDetailed && (length!=='아주 짧게'||!directive.customSentence)) parts.push(researchPool[0].text);

  const closes = isCafe ? [`전체적으로 편하게 다녀오기 좋았어요.${em}`,`다음에 근처 가면 또 들르고 싶어요.${em}`]
    : [`전체적으로 만족스럽게 식사하고 나왔어요.${em}`,`다음에 근처 가면 다른 메뉴도 먹어보고 싶어요.${em}`];
  if(length==='아주 짧게') return parts.slice(0,3).join(' ').trim();
  if(length==='보통') parts.push(pick(closes)); else if(parts.length<3) parts.push(pick(closes));
  return parts.join(' ').replace(/\s+/g,' ').trim();
}

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const place=clean(req.body?.place,120), menu=clean(req.body?.menu,220), note=clean(req.body?.note,500);
  const length=clean(req.body?.length,20)||'짧게', tone=clean(req.body?.tone,20)||'자연스럽게', emoji=req.body?.emoji!==false;
  if(!place) return res.status(400).json({error:'상호명 또는 장소명을 입력해 주세요.'});
  let research={researched:false,category:inferCategory(place,menu,''),features:[],tasteDetails:[],sources:[]};
  try{research=await researchPlace(place,menu)}catch(_){}
  const review=buildReview({place,menu,note,length,tone,emoji,features:research.features,tasteDetails:research.tasteDetails,category:research.category});
  return res.status(200).json({review,researched:research.researched,category:research.category?.label||'음식점',features:research.features.map(f=>f.label),tasteDetails:research.tasteDetails,sources:research.sources});
};
