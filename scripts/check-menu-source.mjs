const body = {
  buildingId: "14d70caa-49e6-eb11-a2c9-fa7552227e36",
  districtId: "7810c14e-a7e4-eb11-a2c5-8cc0b3a2728d",
  startDate: "11-06-2026",
  endDate: "11-13-2026",
  mealTypes: ["Lunch"],
};
for (const path of ["/get-menu-json", "/get-menu"]) {
  try {
    const response = await fetch("https://schoolmenuconnector.com" + path, {
      method: "POST", headers: {"content-type":"application/json"},
      body: JSON.stringify(body), signal: AbortSignal.timeout(60000)
    });
    const text=await response.text();
    console.log(JSON.stringify({path,status:response.status,contentType:response.headers.get("content-type"),body:text.slice(0,45000)}));
  } catch(error) { console.log(JSON.stringify({path,error:error.message})); }
}
