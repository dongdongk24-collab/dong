const baseHandler = require('./review');

function clean(v, max = 600) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function captureBase(req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const headers = {};
    const res = {
      setHeader(k, v) { headers[String(k).toLowerCase()] = v; return this; },
      status(code) { statusCode = code; return this; },
      json(payload) { resolve({ statusCode, headers, payload }); return this; },
      send(payload) { resolve({ statusCode, headers, payload }); return this; },
      end(payload) { resolve({ statusCode, headers, payload }); return this; }
    };
    Promise.resolve(baseHandler(req, res)).catch(reject);
  });
}

function splitSentences(text) {
  return clean(text, 3000).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

function hasAny(text, re) { return re.test(String(text || '').toLowerCase()); }

function parseNote(note) {
  const raw = clean(note, 600);
  const lower = raw.toLowerCase();
  const negative = /(빼줘|빼 줘|제외|언급하지|쓰지|넣지|삭제|빼고|말고)/;
  const include = /(넣어|넣어줘|넣어 줘|써줘|써 줘|적어줘|적어 줘|반영|언급|포함|이야기|강조|위주|중심)/;
  const isNegative = negative.test(lower);
  return { raw, lower, isNegative, includeRequested: include.test(lower) && !isNegative };
}

const TOPICS = [
  { key:'parking', words:/(주차|주차장)/, feature:'주차 편의', remove:/(주차|차로 방문)/ },
  { key:'friendly', words:/(친절|서비스|응대)/, feature:'친절한 응대', remove:/(친절|응대|서비스)/ },
  { key:'clean', words:/(깔끔|깨끗|청결)/, feature:'깔끔함', remove:/(깔끔|깨끗|청결)/ },
  { key:'value', words:/(가성비|가격)/, feature:'가성비', remove:/(가성비|가격)/ },
  { key:'wait', words:/(웨이팅|대기|기다)/, feature:'웨이팅·대기', remove:/(웨이팅|대기|기다)/ },
  { key:'atmosphere', words:/(분위기|공간|인테리어)/, feature:'식사 분위기', remove:/(분위기|공간|인테리어)/ },
  { key:'portion', words:/(양|푸짐|넉넉)/, feature:'양이 넉넉함', remove:/(양도|푸짐|넉넉)/ },
  { key:'revisit', words:/(재방문|또 가|다시 가|또 방문)/, feature:'재방문 언급', remove:/(재방문|또 들르|또 방문|다른 메뉴도)/ }
];

function requestedSentence(topic, note, category, features) {
  const n = note.lower;
  const isCafe = String(category || '').includes('카페');
  const featureSet = new Set(features || []);
  const explicitlyPositive = {
    parking: /(주차.{0,18}(편|좋|쉬|넓|무료)|편하.{0,12}주차)/.test(n),
    friendly: /(친절|응대.{0,12}좋|서비스.{0,12}좋)/.test(n),
    clean: /(깔끔|깨끗|청결)/.test(n),
    value: /(가성비.{0,12}좋|가격.{0,12}(괜찮|좋|합리))/ .test(n),
    wait: /(웨이팅.{0,12}(짧|없)|대기.{0,12}(짧|없)|안 기다)/.test(n),
    atmosphere: /(분위기.{0,12}(좋|편|조용)|공간.{0,12}(좋|편|넓)|인테리어.{0,12}(좋|예쁘))/ .test(n),
    portion: /(양.{0,12}(많|넉넉|푸짐)|푸짐|넉넉)/.test(n),
    revisit: /(재방문|또 가|다시 가|또 방문)/.test(n)
  }[topic.key];

  const supported = featureSet.has(topic.feature) || explicitlyPositive;
  if (!supported) return '';

  switch (topic.key) {
    case 'parking': return '주차도 편해서 차로 방문하기 좋았어요.';
    case 'friendly': return isCafe ? '직원분들도 친절해서 기분 좋게 이용했어요.' : '직원분들도 친절해서 기분 좋게 식사했어요.';
    case 'clean': return isCafe ? '매장도 깔끔해서 편하게 머물기 좋았어요.' : '매장도 깔끔해서 편하게 식사하기 좋았어요.';
    case 'value': return '가격도 부담스럽지 않아 가성비 좋게 느껴졌어요.';
    case 'wait': return '대기 부담이 크지 않아 편하게 이용할 수 있었어요.';
    case 'atmosphere': return isCafe ? '분위기도 편안해서 여유롭게 머물기 좋았어요.' : '분위기도 편안해서 식사하기 좋았어요.';
    case 'portion': return '양도 넉넉해서 든든하게 먹기 좋았어요.';
    case 'revisit': return isCafe ? '다음에 근처 오면 또 들르고 싶어요.' : '다음에 근처 가면 또 방문하고 싶어요.';
    default: return '';
  }
}

function applyExclusions(sentences, note) {
  let out = sentences.slice();
  for (const t of TOPICS) {
    const exclusion = new RegExp(`${t.words.source}.{0,18}(빼|제외|언급하지|쓰지|넣지)|(?:빼|제외).{0,18}${t.words.source}`);
    if (exclusion.test(note.lower)) out = out.filter(s => !t.remove.test(s));
  }
  return out;
}

function insertBeforeClosing(sentences, sentence, length) {
  if (!sentence || sentences.some(s => s.includes(sentence.replace(/[.!?]+$/,'')))) return sentences;
  const out = sentences.slice();
  if (length === '아주 짧게') {
    if (out.length >= 3) out.splice(2, out.length - 2, sentence);
    else out.push(sentence);
    return out.slice(0, 3);
  }
  const closingRe = /(전체적으로|다음에|또 들르고|또 방문|만족스럽게)/;
  let idx = out.findIndex((s, i) => i > 0 && closingRe.test(s));
  if (idx < 0) idx = out.length;
  out.splice(idx, 0, sentence);
  return out;
}

function applyInstructions(result, body) {
  const note = parseNote(body?.note);
  if (!note.raw || !result || !result.review) return result;

  let sentences = applyExclusions(splitSentences(result.review), note);
  const features = Array.isArray(result.features) ? result.features : [];
  const category = result.category || '';
  const length = clean(body?.length, 20) || '짧게';

  // 요청사항은 결과 문장으로 복사하지 않고, 관련 내용을 강제로 포함/제외하는 지시로만 사용한다.
  for (const topic of TOPICS) {
    if (!topic.words.test(note.lower)) continue;
    const exclusion = new RegExp(`${topic.words.source}.{0,18}(빼|제외|언급하지|쓰지|넣지)|(?:빼|제외).{0,18}${topic.words.source}`);
    if (exclusion.test(note.lower)) continue;
    if (!note.includeRequested && !/(편하다고|좋다고|많다고|친절하다고|깔끔하다고|넉넉하다고)/.test(note.lower)) continue;
    const s = requestedSentence(topic, note, category, features);
    if (s) sentences = insertBeforeClosing(sentences, s, length);
  }

  // 요청 문구 자체가 결과에 남는 비정상 케이스를 제거한다.
  const directiveFragments = note.raw.split(/[\/|,]+/).map(x => x.trim()).filter(x => x.length >= 4);
  sentences = sentences.filter(s => !directiveFragments.some(f => s.includes(f) && /(해줘|해주세요|써줘|적어줘|넣어줘|빼줘|위주로|중심으로)/.test(f)));

  result.review = sentences.join(' ').replace(/\s+/g, ' ').trim();
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error:'POST only' });
  try {
    const captured = await captureBase(req);
    const payload = captured.payload && typeof captured.payload === 'object'
      ? applyInstructions({ ...captured.payload }, req.body || {})
      : captured.payload;
    return res.status(captured.statusCode || 200).json(payload);
  } catch (e) {
    return res.status(500).json({ error:'리뷰 생성 중 오류가 발생했습니다.' });
  }
};
