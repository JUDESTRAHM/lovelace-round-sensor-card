import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
const srv = http.createServer((q, r) => {
  const f = path.join(root, "test", decodeURIComponent(q.url.split("?")[0]));
  const p = fs.existsSync(f) ? f : path.join(root, decodeURIComponent(q.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[path.extname(p)] || "text/plain" }); r.end(fs.readFileSync(p));
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const pg = await b.newPage({ viewport: { width: 560, height: 300 }, deviceScaleFactor: 2 });
const errs = [];
pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await pg.goto(`http://localhost:${port}/page.html`);
await pg.waitForFunction(() => document.title === "ready");
await pg.waitForTimeout(300);
const h = await pg.evaluate(() => document.body.getBoundingClientRect().height);
await pg.setViewportSize({ width: 560, height: Math.ceil(h) + 8 });
await pg.screenshot({ path: path.join(root, "screenshot.png") });
console.log("errors:", errs); await b.close(); srv.close();
