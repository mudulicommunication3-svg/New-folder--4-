// Netlify Function: JioMart live product search.
//
// Same approach as the Telegram bot's jiomart_search.py - a SERVER-SIDE call
// to the JioMart catalog API with the pincode headers the browser cannot send
// (CORS). The Mini App calls /.netlify/functions/jiomart-search?q=...&pincode=...
//
// GET /.netlify/functions/jiomart-search?q=fortune+oil&pincode=752106
//   -> { "status": "success", "items": [ {title,url,mrp,sp,cat,source}, ... ] }
//
// Node 18+ (global fetch), zero dependencies.

const SEARCH_URL = "https://www.jiomart.com/api/service/application/catalog/v1.0/products";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36";

// Fallback pincodes - same order as the bot (jiomart_search.py).
const FALLBACK_PINCODES = ["753003", "753001", "751010"];

function buildHeaders(pincode) {
  const locDetail = JSON.stringify({
    country: "INDIA",
    country_iso_code: "IN",
    pincode: String(pincode),
  });
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    Origin: "https://www.jiomart.com",
    Referer: "https://www.jiomart.com/",
    pincode: String(pincode),
    "x-pincode": String(pincode),
    "x-location-detail": locDetail,
    "visitor-id": crypto.randomUUID(),
  };
}

async function fetchItems(query, pincode) {
  const url =
    `${SEARCH_URL}?q=${encodeURIComponent(query)}&page_size=12&page_no=1`;
  const res = await fetch(url, {
    headers: buildHeaders(pincode),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("JioMart HTTP " + res.status);
  const data = await res.json();
  const body = data && typeof data.data === "object" ? data.data : {};
  const items = (data && data.items) || (body && body.items) || [];
  return items.filter((i) => i && typeof i === "object");
}

function num(val) {
  if (val && typeof val === "object") {
    const n = Number(val.min ?? val.max ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(val || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeItem(item) {
  let img = "";
  const medias = Array.isArray(item.medias) ? item.medias : [];
  for (const m of medias) {
    if (m && m.url && (!m.type || String(m.type).toLowerCase() === "image")) {
      img = m.url;
      break;
    }
  }
  if (!img && medias.length && medias[0] && medias[0].url) img = medias[0].url;

  const price = item.price || {};
  const hier = item.hierarchy || {};
  const cat =
    (hier.l3_category && hier.l3_category.name) ||
    (hier.l2_category && hier.l2_category.name) ||
    "Grocery";

  return {
    title: item.name || "Product",
    url: img,
    mrp: String(num(price.marked) || ""),
    sp: String(num(price.effective) || ""),
    cat: cat,
    source: "JioMart",
  };
}

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const query = String(params.q || "").trim();
  const requestedPin = String(params.pincode || "").trim();

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (!query) {
    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: "Query missing" }),
    };
  }

  // Requested pincode first, then the bot's fallback list (deduplicated).
  const pins = [requestedPin, ...FALLBACK_PINCODES].filter(
    (p, i, a) => p && a.indexOf(p) === i
  );

  let items = [];
  for (const pin of pins) {
    try {
      const raw = await fetchItems(query, pin);
      if (raw.length) {
        items = raw.map(normalizeItem).filter((it) => it.url);
        break;
      }
    } catch (e) {
      // try the next pincode
    }
  }

  return {
    statusCode: 200,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "success", items: items }),
  };
};
