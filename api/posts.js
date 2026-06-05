const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns");

const SOURCES = [
  { id: "kaswc", name: "\uD55C\uAD6D\uC0AC\uD68C\uBCF5\uC9C0\uAD00\uD611\uD68C", urls: ["https://www.kaswc.or.kr/support/rss", "https://kaswc.or.kr/support/rss", "http://www.kaswc.or.kr/support/rss", "http://kaswc.or.kr/support/rss"], pageUrl: "https://kaswc.or.kr/support", origin: "https://kaswc.or.kr", type: "rss" },
  { id: "saswc", name: "\uC11C\uC6B8\uC2DC\uC0AC\uD68C\uBCF5\uC9C0\uAD00\uD611\uD68C", urls: ["https://www.saswc.org/support"], origin: "https://www.saswc.org", type: "rhymix" },
  { id: "welfare-gallery", name: "\uD55C\uAD6D\uC0AC\uD68C\uBCF5\uC9C0\uC0AC\uD611\uD68C \uD604\uC7A5\uC18C\uC2DD", urls: ["https://api.welfare.net/main/na/ntt/selectNttList.do?mi=1081&bbsId=1093&currPage=1&searchType=all&searchValue=&listCo=9"], pageUrl: "https://www.welfare.net/data/gallery", origin: "https://www.welfare.net", type: "welfareGallery" },
  { id: "bokji-biz", name: "\uBCF5\uC9C0\uB137 \uC0AC\uC5C5\uACF5\uBAA8", urls: ["https://www.bokji.net/not/biz/01.bokji", "http://www.bokji.net/not/biz/01.bokji"], origin: "https://www.bokji.net", type: "bokjiBiz", pages: [1, 2] },
];

function decodeHtml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
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
  if (!href) return origin;
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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": source.origin + "/",
    ...extra,
  };
}

function requestText(url, source, extraHeaders = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === "http:" ? http : https;
    const req = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: headersFor(source, extraHeaders),
      lookup: (hostname, options, cb) => dns.lookup(hostname, { ...options, family: 4 }, cb),
      timeout: 12000,
    }, (res) => {
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && location && redirectCount < 4) {
        res.resume();
        const nextUrl = new URL(location, target).toString();
        requestText(nextUrl, source, extraHeaders, redirectCount + 1).then(resolve, reject);
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(body);
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function textWithFallback(urls, source, headers = {}) {
  const attempts = Array.isArray(urls) ? urls : [urls];
  const errors = [];
  for (const url of attempts) {
    try {
      return await requestText(url, source, headers);
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" / "));
}

function parseRssDate(value) {
  if (!value) return "";
  const date = new Date(decodeHtml(value));
  if (Number.isNaN(date.getTime())) return decodeHtml(value).slice(0, 10).replaceAll("-", ".");
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

async function fetchRss(source) {
  const xml = await textWithFallback(source.urls, source, { "Accept": "application/rss+xml, application/xml, text/xml, */*" });
  const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)];
  const posts = items.map((match, index) => {
    const item = match[0];
    const title = decodeHtml((item.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const link = decodeHtml((item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const guid = decodeHtml((item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || link || String(index));
    const date = parseRssDate((item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || item.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) || [])[1] || "");
    if (!title) return null;
    const number = (link.match(/\/(\d+)(?:\?|$)/) || [])[1] || String(index + 1);
    return { id: `${source.id}-${guid}`, sourceId: source.id, source: source.name, number, category: "지원사업", title, date, url: link ? resolveLink(source.origin, link) : source.pageUrl };
  }).filter(Boolean);
  if (posts.length === 0) throw new Error("RSS 목록을 찾지 못했습니다");
  return dedupe(posts);
}

function parseRhymixRows(source, html) {
  const table = html.match(/<table[^>]*class=["'][^"']*bd_lst[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  const rows = [...(table ? table[1] : html).matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)];
  return dedupe(rows.map((rowMatch) => {
    const cells = [...rowMatch[2].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({ attrs: match[1] || "", html: match[2] || "" }));
    if (cells.length < 4) return null;
    const number = decodeHtml(cells[0].html);
    if (!number || number === "공지") return null;
    const titleCellIndex = cells.findIndex((cell) => /\btitle\b/i.test(cell.attrs));
    if (titleCellIndex < 0) return null;
    const link = cells[titleCellIndex].html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) return null;
    const title = decodeHtml(link[2]);
    const dateCell = cells.find((cell) => /^\d{4}\.\d{2}\.\d{2}$/.test(decodeHtml(cell.html)));
    if (!title) return null;
    return { id: `${source.id}-${number}`, sourceId: source.id, source: source.name, number, category: titleCellIndex > 1 ? decodeHtml(cells[1].html) : "", title, date: dateCell ? decodeHtml(dateCell.html) : "", url: resolveLink(source.origin, link[1]) };
  }).filter(Boolean));
}

async function fetchRhymix(source) {
  const html = await textWithFallback(source.urls, source);
  const posts = parseRhymixRows(source, html);
  if (posts.length === 0) throw new Error("게시글 목록을 찾지 못했습니다");
  return posts;
}

async function fetchWelfareGallery(source) {
  const body = await textWithFallback(source.urls, source, { "Accept": "application/json, text/plain, */*", "Origin": "https://www.welfare.net", "Referer": "https://www.welfare.net/data/gallery" });
  const list = JSON.parse(body)?.nttListPaging?.list || [];
  const posts = list.map((item) => ({ id: `${source.id}-${item.nttSn}`, sourceId: source.id, source: source.name, number: String(item.rsn || item.nttSn || ""), category: "현장소식", title: decodeHtml(item.nttSj || ""), date: item.regDt || "", url: `${source.origin}/data/gallery/gallery-detail?mi=1081&bbsId=1093&nttSn=${encodeURIComponent(item.nttSn)}` })).filter((post) => post.title);
  if (posts.length === 0) throw new Error("게시글 목록을 찾지 못했습니다");
  return posts;
}

function parseBokjiRows(source, html) {
  const table = html.match(/<table[^>]*class=["'][^"']*board_list_type1[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  const rows = [...(table ? table[1] : html).matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)];
  return rows.map((rowMatch) => {
    const cells = [...rowMatch[2].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({ attrs: match[1] || "", html: match[2] || "" }));
    if (cells.length < 5) return null;
    const number = decodeHtml(cells[0].html);
    if (!number || number === "공지") return null;
    const subjectCell = cells[1].html;
    const viewMatch = subjectCell.match(/goView\(['"]?(\d+)['"]?\)/i);
    const linkMatch = subjectCell.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = decodeHtml(linkMatch ? linkMatch[1] : subjectCell);
    if (!title) return null;
    const boardId = viewMatch ? viewMatch[1] : number;
    return { id: `${source.id}-${boardId}`, sourceId: source.id, source: source.name, number, category: "사업공모", title, date: decodeHtml(cells[3].html).replaceAll("-", "."), url: `${source.origin}/not/biz/01_01.bokji?BOARDIDX=${encodeURIComponent(boardId)}` };
  }).filter(Boolean);
}

async function fetchBokjiPage(source, page) {
  const suffix = page > 1 ? `?PG=${page}` : "";
  const urls = source.urls.map((url) => `${url}${suffix}`);
  const html = await textWithFallback(urls, source, { "Referer": source.urls[0] });
  return parseBokjiRows(source, html);
}

async function fetchBokjiBiz(source) {
  const posts = dedupe((await Promise.all((source.pages || [1]).map((page) => fetchBokjiPage(source, page)))).flat());
  if (posts.length === 0) throw new Error("게시글 목록을 찾지 못했습니다");
  return posts;
}

async function fetchSource(source) {
  if (source.type === "rss") return fetchRss(source);
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
      errors.push({ sourceId: source.id, source: source.name, message: result.reason?.message || "수집 실패" });
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
    sources: SOURCES.map((source) => ({ id: source.id, name: source.name, url: source.pageUrl || source.urls[0] })),
    errors,
    posts: uniquePosts,
  });
};
