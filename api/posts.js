const SOURCES = [
  {
    id: "kaswc",
    name: "\uD55C\uAD6D\uC0AC\uD68C\uBCF5\uC9C0\uAD00\uD611\uD68C",
    url: "https://kaswc.or.kr/support",
    origin: "https://kaswc.or.kr",
    type: "rhymix",
  },
  {
    id: "saswc",
    name: "\uC11C\uC6B8\uC2DC\uC0AC\uD68C\uBCF5\uC9C0\uAD00\uD611\uD68C",
    url: "https://www.saswc.org/support",
    origin: "https://www.saswc.org",
    type: "rhymix",
  },
  {
    id: "welfare-gallery",
    name: "\uD55C\uAD6D\uC0AC\uD68C\uBCF5\uC9C0\uC0AC\uD611\uD68C \uD604\uC7A5\uC18C\uC2DD",
    url: "https://www.welfare.net/data/gallery",
    origin: "https://www.welfare.net",
    type: "welfareGallery",
  },
  {
    id: "bokji-biz",
    name: "\uBCF5\uC9C0\uB137 \uC0AC\uC5C5\uACF5\uBAA8",
    url: "https://www.bokji.net/not/biz/01.bokji",
    origin: "https://www.bokji.net",
    type: "bokjiBiz",
    pages: [1, 2],
  },
];

function decodeHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveLink(origin, href) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${origin}${href}`;
  return `${origin}/${href}`;
}

function dedupe(posts) {
  const seen = new Set();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

function headersFor(source, extra = {}) {
  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6",
    referer: source.origin + "/",
    ...extra,
  };
}

function parseRhymixRows(source, html) {
  const table = html.match(/<table[^>]*class=["'][^"']*bd_lst[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  const scopedHtml = table ? table[1] : html;
  const rows = [...scopedHtml.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)];

  return dedupe(rows.map((rowMatch) => {
    const row = rowMatch[2];
    const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({ attrs: match[1] || "", html: match[2] || "" }));
    if (cells.length < 4) return null;

    const number = decodeHtml(cells[0].html);
    if (!number || number === "\uACF5\uC9C0") return null;

    const titleCellIndex = cells.findIndex((cell) => /\btitle\b/i.test(cell.attrs));
    if (titleCellIndex < 0) return null;

    const titleCell = cells[titleCellIndex].html;
    const link = titleCell.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) return null;

    const dateCell = cells.find((cell) => /^\d{4}\.\d{2}\.\d{2}$/.test(decodeHtml(cell.html)));
    const category = titleCellIndex > 1 ? decodeHtml(cells[1].html) : "";
    const title = decodeHtml(link[2]);
    if (!title) return null;

    return {
      id: `${source.id}-${number}`,
      sourceId: source.id,
      source: source.name,
      number,
      category,
      title,
      date: dateCell ? decodeHtml(dateCell.html) : "",
      url: resolveLink(source.origin, link[1]),
    };
  }).filter(Boolean));
}

async function fetchRhymix(source) {
  const response = await fetch(source.url, { redirect: "follow", headers: headersFor(source) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const posts = parseRhymixRows(source, await response.text());
  if (posts.length === 0) throw new Error("게시글 목록을 찾지 못했습니다");
  return posts;
}

async function fetchWelfareGallery(source) {
  const apiUrl = "https://api.welfare.net/main/na/ntt/selectNttList.do?mi=1081&bbsId=1093&currPage=1&searchType=all&searchValue=&listCo=9";
  const response = await fetch(apiUrl, {
    headers: headersFor(source, {
      accept: "application/json, text/plain, */*",
      origin: "https://www.welfare.net",
      referer: "https://www.welfare.net/data/gallery",
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json();
  const list = payload?.nttListPaging?.list || [];
  const posts = list.map((item) => ({
    id: `${source.id}-${item.nttSn}`,
    sourceId: source.id,
    source: source.name,
    number: String(item.rsn || item.nttSn || ""),
    category: "현장소식",
    title: decodeHtml(item.nttSj || ""),
    date: item.regDt || "",
    url: `${source.origin}/data/gallery/gallery-detail?mi=1081&bbsId=1093&nttSn=${encodeURIComponent(item.nttSn)}`,
  })).filter((post) => post.title);

  if (posts.length === 0) throw new Error("게시글 목록을 찾지 못했습니다");
  return posts;
}

function parseBokjiRows(source, html) {
  const table = html.match(/<table[^>]*class=["'][^"']*board_list_type1[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  const scopedHtml = table ? table[1] : html;
  const rows = [...scopedHtml.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)];

  return rows.map((rowMatch) => {
    const row = rowMatch[2];
    const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({ attrs: match[1] || "", html: match[2] || "" }));
    if (cells.length < 5) return null;

    const number = decodeHtml(cells[0].html);
    if (!number || number === "\uACF5\uC9C0") return null;

    const subjectCell = cells[1].html;
    const viewMatch = subjectCell.match(/goView\(['"]?(\d+)['"]?\)/i);
    const linkMatch = subjectCell.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = decodeHtml(linkMatch ? linkMatch[1] : subjectCell);
    if (!title) return null;

    const boardId = viewMatch ? viewMatch[1] : number;
    return {
      id: `${source.id}-${boardId}`,
      sourceId: source.id,
      source: source.name,
      number,
      category: "사업공모",
      title,
      date: decodeHtml(cells[3].html),
      url: `${source.origin}/not/biz/01_01.bokji?BOARDIDX=${encodeURIComponent(boardId)}`,
    };
  }).filter(Boolean);
}

async function fetchBokjiPage(source, page) {
  const body = new URLSearchParams({
    PG: String(page),
    BOARDIDX: "",
    SEARCH_GUBUN: "TITLE",
    SEARCH_KEYWORD: "",
  });
  const response = await fetch(source.url, {
    method: "POST",
    headers: headersFor(source, {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: source.url,
    }),
    body,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseBokjiRows(source, await response.text());
}

async function fetchBokjiBiz(source) {
  const pages = source.pages || [1];
  const pageResults = await Promise.all(pages.map((page) => fetchBokjiPage(source, page)));
  const posts = dedupe(pageResults.flat());
  if (posts.length === 0) throw new Error("게시글 목록을 찾지 못했습니다");
  return posts;
}

async function fetchSource(source) {
  if (source.type === "welfareGallery") return fetchWelfareGallery(source);
  if (source.type === "bokjiBiz") return fetchBokjiBiz(source);
  return fetchRhymix(source);
}

function dateKey(post) {
  return String(post.date || "").replaceAll("-", ".");
}

module.exports = async function handler(req, res) {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
  const posts = [];
  const errors = [];
  const sourceCounts = {};

  settled.forEach((result, index) => {
    const source = SOURCES[index];
    if (result.status === "fulfilled") {
      posts.push(...result.value);
      sourceCounts[source.id] = result.value.length;
    } else {
      sourceCounts[source.id] = 0;
      errors.push({
        sourceId: source.id,
        source: source.name,
        message: result.reason?.message || "\uC218\uC9D1 \uC2E4\uD328",
      });
    }
  });

  const uniquePosts = dedupe(posts);
  uniquePosts.sort((a, b) => {
    const dateCompare = dateKey(b).localeCompare(dateKey(a));
    if (dateCompare !== 0) return dateCompare;
    return String(a.sourceId).localeCompare(String(b.sourceId));
  });

  res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=600");
  res.status(200).json({
    updatedAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }),
    cacheSeconds: 180,
    count: uniquePosts.length,
    sourceCounts,
    sources: SOURCES.map(({ id, name, url }) => ({ id, name, url })),
    errors,
    posts: uniquePosts,
  });
};
