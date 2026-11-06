import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = resolve(root, "public");
const snapshot = JSON.parse(await readFile(resolve(root, "calendar/dashboard.json"), "utf8"));
await mkdir(resolve(root, "artifacts"), { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    let path = decodeURIComponent(url.pathname).replace(/^\/wsns\/?/, "");
    if (!path) path = "index.html";
    const file = resolve(publicDir, path);
    if (!file.startsWith(publicDir + sep)) throw new Error("Invalid path");
    const body = await readFile(file);
    const types = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
    response.writeHead(200, {"content-type": types[extname(file)] || "application/octet-stream"});
    response.end(body);
  } catch { response.writeHead(404); response.end("Not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const target = process.env.CHECK_DASHBOARD_URL || "http://127.0.0.1:" + server.address().port + "/wsns/";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({headless:true, channel:"chrome"});
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (!process.env.CHECK_DASHBOARD_URL) {
    await page.route("**/calendar/dashboard.json", route => route.fulfill({
      contentType:"application/json", headers:{"access-control-allow-origin":"*"}, body:JSON.stringify(snapshot)
    }));
  }
  await page.goto(target, {waitUntil:"networkidle",timeout:45000});
  await page.locator(".hero").waitFor({timeout:15000});
  assert.equal(await page.locator(".day").count(),5);
  if (snapshot.days.some(day => day.lunch?.all?.length)) {
    const details=page.locator(".menuDetails").first();
    await details.locator("summary").click();
    assert.ok(await details.locator(".menuGroups li").count() > 0);
  }
  await page.screenshot({path:resolve(root,"artifacts/dashboard-desktop.png"),fullPage:true});
  await page.locator("#infoBtn").click();
  assert.ok((await page.locator("#calUrl").textContent()).endsWith("/calendar/wsns-v2.ics"));
  await page.locator("#closeInfo").click();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({path:resolve(root,"artifacts/dashboard-mobile.png"),fullPage:true});
  await page.locator("#refreshBtn").click();
  await page.locator(".hero").waitFor({timeout:15000});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({dashboard:target,status:"passed",desktop:true,mobile:true,menuDetails:true,consoleErrors:errors}));
} finally {
  await browser.close();
  server.close();
}
const observations=[];
for (const [label,url] of [
  ["netlify","https://danfinn5.netlify.app/"],
  ["github-pages","https://danfinn5.github.io/"],
  ["portfolio-pages-settings","https://api.github.com/repos/danfinn5/danfinn5.github.io/pages"],
  ["school-deployments","https://api.github.com/repos/danfinn5/wsns-school-day/deployments?per_page=3"],
  ["portfolio-deployments","https://api.github.com/repos/danfinn5/danfinn5.github.io/deployments?per_page=3"]
]) {
  try {
    const response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(15000)});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
    const result={label,status:response.status,url:response.url,details:data?Array.isArray(data)?data.map(d=>({id:d.id,environment:d.environment,statuses_url:d.statuses_url})):data:text.slice(0,250)};
    observations.push(result);console.log(JSON.stringify(result));
  } catch(error){observations.push({label,error:error.message});console.log(JSON.stringify({label,error:error.message}));}
}
await writeFile(resolve(root,"artifacts/hosting-status.json"),JSON.stringify(observations,null,2));
