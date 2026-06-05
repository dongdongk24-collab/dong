const SOURCES = [
  {
    id: "kaswc",
    name: "\uD55C\uAD6D\uC0AC\uD68C\uBCF5\uC9C0\uAD00\uD611\uD68C",
    url: "https://kaswc.or.kr/support",
    origin: "https://kaswc.or.kr",
  },
  {
    id: "saswc",
    name: "\uC11C\uC6B8\uC2DC\uC0AC\uD68C\uBCF5\uC9C0\uAD00\uD611\uD68C",
    url: "https://www.saswc.org/support",
    origin: "https://www.saswc.org",
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

function parseRowsFromHtml(source, html) {
  const rows = [...html.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)];

  return rows
    .map((rowMatch) => {
      const row = rowMatch[2];
      const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({
        attrs: match[1] || "",
        html: match[2] || "",
      }));

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
    })
    .filter(Boolean);
}

function parseBoardRows(source, html) {
  const boardTable = html.match(/<table[^>]*class=["'][^"']*bd_lst[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  const scopedHtml = boardTable ? boardTable[1] : html;
  const posts = parseRowsFromHtml(source, scopedHtml);

  const seen = new Set();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

function headersFor(source) {
  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6",
    referer: source.origin + "/",
  };
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    redirect: "follow",
    headers: headersFor(source),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const posts = parseBoardRows(source, html);
  if (posts.length === 0) {
    throw new Error("게시글 목록을 찾지 못했습니다");
  }
  return posts;
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

  posts.sort((a, b) => {
    const dateCompare = String(b.date).localeCompare(String(a.date));
    if (dateCompare !== 0) return dateCompare;
    return String(a.sourceId).localeCompare(String(b.sourceId));
  });

  res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=600");
  res.status(200).json({
    updatedAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }),
    cacheSeconds: 180,
    count: posts.length,
    sourceCounts,
    sources: SOURCES.map(({ id, name, url }) => ({ id, name, url })),
    errors,
    posts,
  });
};
