// =========================================================================
// ୧. doGet: Sheet ଡାଟା ପଢ଼ିବା ଏବଂ JioMart Pincode Search
// =========================================================================
function doGet(e) {
  var params = e ? e.parameter : {};

  // ବିକଳ୍ପ A: JioMart ଲାଇଭ୍ Search Proxy
  if (params && params.action === "SEARCH_JIOMART") {
    var q = params.query || "";
    var pin = params.pincode || "752106";
    var results = fetchJioMartByPin(q, pin);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", items: results }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ବିକଳ୍ପ B: Sheet1 ରୁ କାଟାଲଗ୍ ପଢ଼ିବା
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  var rows = sheet.getDataRange().getValues();
  var products = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (row[0] && row[0].toString().trim() !== "") {
      products.push({
        rowIndex: i + 1,
        ean: String(row[4] || ("ean-" + i)).trim(),
        product_name: String(row[0]).trim(),
        mrp: String(row[1] || row[2] || "0").trim(),
        selling_price: String(row[2] || row[1] || "0").trim(),
        stock_qty: String(row[3] !== "" ? row[3] : "10").trim(),
        image_url: String(row[5] || "").trim(),
        category: String(row[6] || "General").trim()
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(products)).setMimeType(ContentService.MimeType.JSON);
}

// =========================================================================
// ୨. doPost: ପ୍ରଡକ୍ଟ ADD / EDIT ଏବଂ Orders ସମ୍ଭାଳିବା
// =========================================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var prodSheet = ss.getSheetByName("Sheet1");

    // ବିକଳ୍ପ A: ପ୍ରଡକ୍ଟ EDIT / UPDATE
    if (data.action === "EDIT_PRODUCT") {
      var rows = prodSheet.getDataRange().getValues();
      var targetRow = -1;
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][4]).trim() === String(data.ean).trim() || (data.rowIndex && (i + 1) === Number(data.rowIndex))) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow !== -1) {
        prodSheet.getRange(targetRow, 1).setValue(data.name || "");
        prodSheet.getRange(targetRow, 2).setValue(Number(data.mrp || 0));
        prodSheet.getRange(targetRow, 3).setValue(Number(data.sellingPrice || 0));
        prodSheet.getRange(targetRow, 4).setValue(Number(data.stock || 0));
        prodSheet.getRange(targetRow, 5).setValue(data.ean || "");
        prodSheet.getRange(targetRow, 6).setValue(data.image || "");
        prodSheet.getRange(targetRow, 7).setValue(data.category || "General");
        return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "product_updated" })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ବିକଳ୍ପ B: ପ୍ରଡକ୍ଟ ADD
    if (data.action === "ADD_PRODUCT" || (data.mrp !== undefined && data.sellingPrice !== undefined)) {
      if (!prodSheet) prodSheet = ss.insertSheet("Sheet1");
      prodSheet.appendRow([
        data.name || "",
        Number(data.mrp || 0),
        Number(data.sellingPrice || 0),
        Number(data.stock || 10),
        data.ean || ("ean-" + Date.now()),
        data.image || "",
        data.category || "General"
      ]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "product_added" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ବିକଳ୍ପ C: Telegram Orders ରେକର୍ଡ
    var orderSheet = ss.getSheetByName("Orders");
    if (!orderSheet) {
      orderSheet = ss.insertSheet("Orders");
      orderSheet.appendRow(["Timestamp", "Order ID", "Customer Name", "Phone", "Address", "Items", "Total", "Channel", "Telegram User ID"]);
    }
    orderSheet.appendRow([
      data.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
      data.order_id || ("MUN-" + Date.now()),
      data.customer_name || data.customer || "",
      data.phone || "",
      data.address || "",
      data.items ? (typeof data.items === 'object' ? JSON.stringify(data.items) : data.items) : "",
      data.total || 0,
      data.channel || "chat",
      data.telegram_user_id || ""
    ]);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "order_recorded" })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================================
// ୩. JioMart API Fetcher (jm1.8.0_3.py Headers ଓ Parsing Pattern)
// =========================================================================
function fetchJioMartByPin(query, pin) {
  var results = [];
  var cleanQ = (query || "").trim();
  if (!cleanQ) return results;

  var targetPin = String(pin || "752106").trim();

  try {
    var url = "https://www.jiomart.com/api/service/application/catalog/v1.0/products?q=" 
              + encodeURIComponent(cleanQ) + "&page_size=12&page_no=1";

    var locDetail = JSON.stringify({
      "country": "INDIA",
      "country_iso_code": "IN",
      "pincode": targetPin
    });

    var headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://www.jiomart.com",
      "Referer": "https://www.jiomart.com/",
      "pincode": targetPin,
      "x-pincode": targetPin,
      "x-location-detail": locDetail,
      "visitor-id": Utilities.getUuid()
    };

    var res = UrlFetchApp.fetch(url, { method: "GET", headers: headers, muteHttpExceptions: true });

    if (res.getResponseCode() === 200) {
      var json = JSON.parse(res.getContentText());
      var body = (json && typeof json.data === "object") ? json.data : {};
      var items = json.items || body.items || [];

      items.forEach(function(item) {
        if (!item || typeof item !== "object") return;

        // Medias extract
        var imgUrl = "";
        var medias = item.medias || [];
        if (Array.isArray(medias) && medias.length > 0) {
          for (var m = 0; m < medias.length; m++) {
            var media = medias[m];
            if (media && media.url && (!media.type || String(media.type).toLowerCase() === "image")) {
              imgUrl = media.url;
              break;
            }
          }
        }

        // Price extract
        var mrp = 0;
        var sp = 0;
        var priceObj = item.price || {};
        if (priceObj.marked) {
          mrp = (typeof priceObj.marked === "object") ? (priceObj.marked.min || priceObj.marked.max || 0) : priceObj.marked;
        }
        if (priceObj.effective) {
          sp = (typeof priceObj.effective === "object") ? (priceObj.effective.min || priceObj.effective.max || 0) : priceObj.effective;
        }

        // Category extract
        var cat = "Grocery";
        if (item.hierarchy && item.hierarchy.l3_category) {
          cat = item.hierarchy.l3_category.name;
        } else if (item.hierarchy && item.hierarchy.l2_category) {
          cat = item.hierarchy.l2_category.name;
        }

        if (imgUrl) {
          results.push({
            title: item.name || "Product",
            url: imgUrl,
            mrp: mrp ? String(mrp) : "",
            sp: sp ? String(sp) : "",
            cat: cat,
            sellable: item.sellable !== undefined ? item.sellable : true,
            source: "JioMart"
          });
        }
      });
    }
  } catch(e) {
    Logger.log("JioMart Fetch Error: " + e.toString());
  }

  return results;
}