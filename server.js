// Plain Node host for src/worker.js (written for Cloudflare Workers).
// Shims the two Cloudflare-specific APIs the worker uses: caches.default
// and the ASSETS static-file binding, so worker.js stays unchanged and
// can still be deployed to Cloudflare later via wrangler.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));

const memoryCache = new Map();

globalThis.caches = {
  default: {
    async match(request) {
      const entry = memoryCache.get(request.url);
      if (!entry) return undefined;
      if (Date.now() > entry.expires) {
        memoryCache.delete(request.url);
        return undefined;
      }
      return new Response(entry.body, {
        status: entry.status,
        headers: entry.headers,
      });
    },
    async put(request, response) {
      const body = Buffer.from(await response.arrayBuffer());
      const cacheControl = response.headers.get("cache-control") || "";
      const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
      memoryCache.set(request.url, {
        body,
        status: response.status,
        headers: Object.fromEntries(response.headers),
        expires: Date.now() + maxAge * 1000,
      });
    },
  },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const env = {
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      const filePath = normalize(join(PUBLIC_DIR, relative));
      if (!filePath.startsWith(normalize(PUBLIC_DIR))) {
        return new Response("Not found", { status: 404 });
      }
      try {
        const data = await readFile(filePath);
        return new Response(data, {
          headers: {
            "content-type":
              MIME_TYPES[extname(filePath)] || "application/octet-stream",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};

const ctx = {
  waitUntil(promise) {
    Promise.resolve(promise).catch(() => {});
  },
};

const worker = (await import("./src/worker.js")).default;

createServer(async (req, res) => {
  try {
    const request = new Request(
      `http://${req.headers.host || "localhost"}${req.url}`,
      {
        method: req.method,
      },
    );
    const response = await worker.fetch(request, env, ctx);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal error");
  }
}).listen(PORT, () => {
  console.log(`wsns-school-day listening on http://localhost:${PORT}`);
});
