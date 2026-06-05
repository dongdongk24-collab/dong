const { collectPosts } = require("../api/posts.js");

const port = Number(process.env.PORT || 3000);

const server = require("node:http").createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("resource collector ok");
    return;
  }

  if (url.pathname !== "/api/posts") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }

  try {
    const payload = await collectPosts();
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    });
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`resource collector listening on ${port}`);
});
