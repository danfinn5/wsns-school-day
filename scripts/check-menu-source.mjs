import { writeFile } from "node:fs/promises";
const buildingId = "14d70caa-49e6-eb11-a2c9-fa7552227e36";
const districtId = "7810c14e-a7e4-eb11-a2c5-8cc0b3a2728d";
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type,p.value]));
const date = Number(parts.month) + "-" + Number(parts.day) + "-" + parts.year;
const variants = [
  { name: "official-plain", host: "api.linqconnect.com", headers: {} },
  { name: "official-compatible", host: "api.linqconnect.com", headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:59.0) Gecko/20100101 Firefox/59.0" } },
  { name: "legacy-public-host", host: "family.titank12.com", headers: {} },
];
const results = [];
for (const variant of variants) {
  const url = new URL("https://" + variant.host + "/api/FamilyMenu");
  url.search = new URLSearchParams({buildingId,districtId,startDate:date,endDate:date});
  try {
    const response = await fetch(url, {headers:variant.headers,signal:AbortSignal.timeout(15000)});
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch {}
    const result = { runner: process.platform, variant:variant.name, status:response.status, finalURL:response.url, contentType:response.headers.get("content-type"), server:response.headers.get("server"), valid: Array.isArray(data?.FamilyMenuSessions), sessions:data?.FamilyMenuSessions?.map(s=>({name:s.ServingSession,plans:s.MenuPlans?.length})), preview:response.ok?undefined:text.slice(0,200)};
    console.log(JSON.stringify(result));
    results.push(result);
    if (result.valid) await writeFile("menu-source-" + process.platform + "-" + variant.name + ".json", JSON.stringify(data,null,2));
  } catch(error) {
    const result={runner:process.platform,variant:variant.name,error:error.message};
    console.log(JSON.stringify(result)); results.push(result);
  }
}
try {
  const response=await fetch("https://linqconnect.com/public/menu/FE53U3?buildingId="+buildingId,{signal:AbortSignal.timeout(15000)});
  const html=await response.text();
  const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)/g)].map(m=>m[1]);
  console.log(JSON.stringify({runner:process.platform,pageStatus:response.status,scripts,preview:response.ok?undefined:html.slice(0,200)}));
} catch(error) { console.log(JSON.stringify({pageError:error.message})); }
await writeFile("menu-source-status-"+process.platform+".json",JSON.stringify(results,null,2));

if (process.platform === "linux") {
  const url = new URL("https://api.linqconnect.com/api/FamilyMenu");
  url.search = new URLSearchParams({buildingId,districtId,startDate:date,endDate:date});
  for (const [name,target] of [
    ["reader-api", "https://r.jina.ai/" + url.toString()],
    ["reader-selected-page", "https://r.jina.ai/https://linqconnect.com/public/menu/FE53U3?buildingId="+buildingId],
  ]) {
    try {
      const response=await fetch(target,{headers:{"x-respond-with":"text"},signal:AbortSignal.timeout(45000)});
      const text=await response.text();
      console.log(JSON.stringify({name,status:response.status,body:text.slice(0,18000)}));
    } catch(error) { console.log(JSON.stringify({name,error:error.message})); }
  }
}
