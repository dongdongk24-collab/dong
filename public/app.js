const state = {
  posts: [],
  sources: [],
  query: "",
  source: "all",
};

const list = document.querySelector("#list");
const searchInput = document.querySelector("#searchInput");
const sourceFilter = document.querySelector("#sourceFilter");
const refreshBtn = document.querySelector("#refreshBtn");
const countText = document.querySelector("#countText");
const updatedText = document.querySelector("#updatedText");
const healthText = document.querySelector("#healthText");

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSources() {
  const current = sourceFilter.value || "all";
  sourceFilter.innerHTML = '<option value="all">전체</option>';
  for (const source of state.sources) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.name;
    sourceFilter.append(option);
  }
  sourceFilter.value = [...sourceFilter.options].some((option) => option.value === current) ? current : "all";
}

function filteredPosts() {
  const query = normalize(state.query);
  return state.posts.filter((post) => {
    const matchesSource = state.source === "all" || post.sourceId === state.source;
    const haystack = normalize(`${post.title} ${post.source} ${post.category} ${post.date}`);
    return matchesSource && (!query || haystack.includes(query));
  });
}

function render() {
  const posts = filteredPosts();
  countText.textContent = `${posts.length.toLocaleString("ko-KR")}개 글`;

  if (posts.length === 0) {
    list.innerHTML = '<div class="empty">조건에 맞는 지원사업 글이 없습니다.</div>';
    return;
  }

  list.innerHTML = posts
    .map((post) => {
      const category = post.category ? ` · ${escapeHtml(post.category)}` : "";
      return `
        <a class="post" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
          <div class="date">${escapeHtml(post.date || "날짜 없음")}</div>
          <div>
            <div class="title">${escapeHtml(post.title)}</div>
            <div class="meta">번호 ${escapeHtml(post.number)}${category}</div>
          </div>
          <div class="source">${escapeHtml(post.source)}</div>
        </a>
      `;
    })
    .join("");
}

function renderHealth(payload) {
  const counts = payload.sourceCounts || {};
  const countTextBySource = (payload.sources || [])
    .map((source) => `${source.name} ${counts[source.id] ?? 0}개`)
    .join(" · ");

  if (payload.errors && payload.errors.length) {
    const errorText = payload.errors.map((error) => `${error.source}: ${error.message}`).join(" / ");
    healthText.textContent = `${countTextBySource} · 오류: ${errorText}`;
    return;
  }

  healthText.textContent = countTextBySource;
}

async function loadPosts({ fresh = false } = {}) {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "갱신 중";
  healthText.textContent = "";

  try {
    const response = await fetch(`/api/posts${fresh ? `?fresh=${Date.now()}` : ""}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();

    state.posts = payload.posts || [];
    state.sources = payload.sources || [];
    renderSources();
    updatedText.textContent = `마지막 갱신 ${payload.updatedAt} · ${payload.cacheSeconds}초 캐시`;
    renderHealth(payload);
    render();
  } catch (error) {
    list.innerHTML = `<div class="empty">게시글을 불러오지 못했습니다: ${escapeHtml(error.message)}</div>`;
    countText.textContent = "오류";
    updatedText.textContent = "배포된 API 상태를 확인해주세요.";
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "새로고침";
  }
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

sourceFilter.addEventListener("change", (event) => {
  state.source = event.target.value;
  render();
});

refreshBtn.addEventListener("click", () => loadPosts({ fresh: true }));

loadPosts();
setInterval(() => loadPosts(), 180000);
