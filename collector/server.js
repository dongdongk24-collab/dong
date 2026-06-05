const apiHandler = require("../api/posts.js");
const http = require("node:http");

const port = Number(process.env.PORT || 3000);

function runApiHandler(req, res) {
  return apiHandler(req, {
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      if (!res.hasHeader("content-type")) {
        res.setHeader("content-type", "application/json; charset=utf-8");
      }
      res.setHeader("access-control-allow-origin", "*");
      res.end(JSON.stringify(payload));
    },
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

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
    await runApiHandler(req, res);
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
