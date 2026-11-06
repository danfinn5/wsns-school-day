import { chromium } from "playwright";

const [menuPage, buildingId, districtId, start, end] = process.argv.slice(2);
const mdy = value => {
  const [year, month, day] = value.split("-");
  return month + "-" + day + "-" + year;
};
const api = new URL("https://api.linqconnect.com/api/FamilyMenu");
for (const [key, value] of Object.entries({
  buildingId, districtId, startDate: mdy(start), endDate: mdy(end)
})) api.searchParams.set(key, value);

const browser = await chromium.launch({ headless: true });
let data;
try {
  const page = await browser.newPage();
  await page.goto(menuPage, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(10000);
  const publicPageText = (await page.locator("body").innerText()).slice(0, 250);
  let result;
  try {
    result = await page.evaluate(async url => {
      const response = await fetch(url, { credentials: "include" });
      return { status: response.status, text: await response.text() };
    }, api.toString());
  } catch (error) {
    console.error("In-page menu request: " + error.message);
  }
  if (result?.status === 200) data = JSON.parse(result.text);
  if (!Array.isArray(data?.FamilyMenuSessions)) {
    // Navigation also permits any public JavaScript challenge to render.
    const response = await page.goto(api.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
    const text = await page.locator("body").innerText();
    try { data = JSON.parse(text); } catch {}
    if (!Array.isArray(data?.FamilyMenuSessions)) {
      throw new Error("Public menu could not be read. HTTP " + response?.status()
        + "; menu page: " + publicPageText + "; API page: " + text.slice(0, 250));
    }
  }
} finally {
  await browser.close();
}
process.stdout.write(JSON.stringify(data));
