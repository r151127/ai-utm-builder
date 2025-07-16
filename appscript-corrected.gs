
/***********************
*  MAIN CONFIGURATION  *
***********************/
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBHeI0tgLKpHuRFQmJtz5xAFMfz2QXf7Lk",
  authDomain: "ai-utm-builder.firebaseapp.com",
  projectId: "ai-utm-builder",
  storageBucket: "ai-utm-builder.appspot.com",
  messagingSenderId: "9904634093",
  appId: "1:9904634093:web:2a4f115e39f8feac3974e4"
};
const TINYURL_API_KEY = "171J7h5Wou41QjvP8bO0rEJEGUMqPbdggli3j5CUnBQ7V4dtbfljPuU9tcfM";

/***********************
*   MENU INITIALIZATION *
***********************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('UTM Builder')
    .addItem('Generate Single UTM', 'showSingleDialog')
    .addItem('Generate Bulk UTMs', 'showBulkDialog')
    .addToUi();
}

/***********************
*    DIALOG FUNCTIONS   *
***********************/
function showSingleDialog() {
  const html = HtmlService.createHtmlOutput(`
    <div style="padding:20px;font-family:Arial">
      <h3>Single UTM Generator</h3>
      <p>Coming soon - Use Bulk Generator for now</p>
      <button onclick="google.script.host.close()" 
              style="margin-top:20px;padding:8px 16px;background:#4285f4;color:white;border:none;border-radius:4px;">
        Close
      </button>
    </div>
  `).setWidth(350).setHeight(200);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Single UTM Generator');
}

function showBulkDialog() {
  const html = HtmlService.createHtmlOutput(`
    <div style="padding:20px;font-family:Arial">
      <h3>Bulk UTM Generator</h3>
      <div style="margin:15px 0">
        <label for="startRow">Start Row:</label>
        <input type="number" id="startRow" style="width:60px;padding:5px;">
      </div>
      <div style="margin:15px 0">
        <label for="endRow">End Row:</label>
        <input type="number" id="endRow" style="width:60px;padding:5px;">
      </div>
      <button onclick="generateUTMs()" 
              style="margin-top:10px;padding:8px 16px;background:#4285f4;color:white;border:none;border-radius:4px;">
        Generate
      </button>
      <p id="status" style="margin-top:15px;color:#666;font-size:12px;"></p>
    </div>
    <script>
      function generateUTMs() {
        const startRow = document.getElementById('startRow').value;
        const endRow = document.getElementById('endRow').value;
        const status = document.getElementById('status');
        
        if (!startRow || !endRow) {
          status.textContent = 'Please enter both row numbers';
          status.style.color = '#d32f2f';
          return;
        }
        
        if (parseInt(endRow) < parseInt(startRow)) {
          status.textContent = 'End row must be ≥ start row';
          status.style.color = '#d32f2f';
          return;
        }
        
        status.textContent = 'Generating...';
        status.style.color = '#666';
        
        google.script.run
          .withSuccessHandler(() => {
            status.textContent = 'Completed successfully!';
            status.style.color = '#388e3c';
            setTimeout(() => google.script.host.close(), 1500);
          })
          .withFailureHandler((err) => {
            status.textContent = 'Error: ' + err.message;
            status.style.color = '#d32f2f';
          })
          .processBulkRows(parseInt(startRow), parseInt(endRow));
      }
    </script>
  `).setWidth(350).setHeight(280);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Bulk UTM Generator');
}

/***********************
*  CORE FUNCTIONALITY  *
***********************/
function processBulkRows(startRow, endRow) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getRange(startRow, 1, endRow - startRow + 1, 11).getValues();
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    // Skip if mandatory fields are empty
    if (!validateRequiredFields(row)) {
      sheet.getRange(startRow + i, 11).setValue("❌ Missing required fields");
      continue;
    }

    try {
      // Process row data
      const {
        email, program, channel, landingPageUrl, 
        platform, placement, code, domain
      } = extractRowData(row);

      // Generate UTM parameters
      const { utm_link, utm_source, utm_medium, utm_campaign } = generateUTMParameters(
        channel, program, placement, landingPageUrl, code
      );

      // Prepare data for Supabase (first save to get tracking URL)
      const linkData = {
        email: email,
        program: program,
        channel: channel,
        platform: platform,
        placement: placement,
        code: code || "",
        domain: domain || "",
        utm_source: utm_source,
        utm_medium: utm_medium,
        utm_campaign: utm_campaign,
        full_url: utm_link,
        short_url: "temp" // Will be updated after TinyURL creation
      };

      console.log(`Row ${startRow + i}: Saving to database first to get tracking URL...`);
      
      // Save to Supabase to get the tracking URL
      const saveResponse = saveToSupabase([linkData]);
      
      if (!saveResponse || !saveResponse.success || !saveResponse.results || saveResponse.results.length === 0) {
        throw new Error("Database save failed: " + (saveResponse.errors ? JSON.stringify(saveResponse.errors) : "Unknown error"));
      }

      const result = saveResponse.results[0];
      const trackingUrl = result.tracking_url;
      
      console.log(`Row ${startRow + i}: Got tracking URL: ${trackingUrl}`);

      // Now create TinyURL pointing to the tracking URL with the original alias
      const customAlias = domain ? domain.replace(/^https?:\/\//, '').replace(/\//g, '') : '';
      const shortUrl = createShortLink(trackingUrl, customAlias);
      
      if (!shortUrl) {
        throw new Error("TinyURL creation failed");
      }

      console.log(`Row ${startRow + i}: Created TinyURL: ${shortUrl}`);

      // Update the database record with the actual short URL
      const updateResponse = updateSupabaseRecord(result.id, shortUrl);
      
      if (!updateResponse || !updateResponse.success) {
        console.warn(`Row ${startRow + i}: Failed to update short URL in database, but continuing...`);
      }

      // Update spreadsheet with success
      updateSpreadsheet(sheet, startRow + i, utm_link, shortUrl);
      
      console.log(`Row ${startRow + i}: Successfully processed`);

    } catch (error) {
      console.error(`Row ${startRow + i} error:`, error);
      sheet.getRange(startRow + i, 11).setValue("❌ " + error.message);
    }
    
    // Rate limit delay
    Utilities.sleep(1000);
  }
}

/***********************
*    HELPER FUNCTIONS   *
***********************/
function validateRequiredFields(row) {
  for (let c = 0; c <= 5; c++) {
    if (!row[c] || row[c].toString().trim() === "") return false;
  }
  return true;
}

function extractRowData(row) {
  return {
    email: row[0].toString().trim(),
    program: row[1].toString().trim(),
    channel: row[2].toString().trim(),
    landingPageUrl: row[3].toString().trim(),
    platform: row[4].toString().trim(),
    placement: row[5].toString().trim(),
    code: row[6] ? row[6].toString().trim() : "",
    domain: row[7] ? row[7].toString().trim() : ""
  };
}

function generateUTMParameters(channel, program, placement, landingPageUrl, code) {
  const sourceKeyMap = {
    "Influencer Marketing": "ifmkt",
    "Digital Marketing": "digitalads",
    "Affiliate": "affiliate",
    "Employee Referral": "empref",
    "Invite & Earn": "invite",
    "NET": "net"
  };
  
  const sourceKey = sourceKeyMap[channel] || channel.replace(/\s+/g, '').toLowerCase();
  const campaign = sourceKey + '-' + program.replace(/\s+/g, '').toLowerCase() + (code ? '-' + code : '');
  
  const utm_link = landingPageUrl +
    "?utm_source=" + encodeURIComponent(sourceKey) +
    "&utm_medium=" + encodeURIComponent(placement.replace(/\s+/g, '_').toLowerCase()) +
    "&utm_campaign=" + encodeURIComponent(campaign);

  return { 
    utm_link, 
    utm_source: sourceKey,
    utm_medium: placement.replace(/\s+/g, '_').toLowerCase(),
    utm_campaign: campaign 
  };
}

function createShortLink(longUrl, customAlias) {
  if (!longUrl) return "";
  
  try {
    const url = "https://api.tinyurl.com/create";
    const alias = customAlias ? customAlias.replace(/^https?:\/\//, '').replace(/\//g, '') : '';
    
    const options = {
      method: "post",
      headers: {
        "Authorization": "Bearer " + TINYURL_API_KEY,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify({
        "url": longUrl,
        "domain": "tinyurl.com",
        "alias": alias
      }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.data?.tiny_url) {
      return result.data.tiny_url;
    }
    
    // Retry with random suffix if alias taken
    if (result.errors?.[0]?.code === "ALIAS_ALREADY_TAKEN") {
      const newAlias = alias + "-" + Math.floor(Math.random() * 10000);
      options.payload = JSON.stringify({
        "url": longUrl,
        "domain": "tinyurl.com",
        "alias": newAlias
      });
      
      const retryResponse = UrlFetchApp.fetch(url, options);
      const retryResult = JSON.parse(retryResponse.getContentText());
      
      if (retryResult.data?.tiny_url) {
        return retryResult.data.tiny_url;
      }
    }
  } catch (e) {
    console.error("TinyURL error:", e);
  }
  return "";
}

function saveToSupabase(linksArray) {
  try {
    const url = "https://msrfiyovfhgyzeivrtlr.supabase.co/functions/v1/import-bulk-utm-links";
    
    const options = {
      method: "POST",
      headers: {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcmZpeW92ZmhneXplaXZydGxyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjEyNTU5OSwiZXhwIjoyMDY3NzAxNTk5fQ.e03QSD2bFS0vG0UP2r3Kgn4HjiF1F3uqDKxCyGiQxNA",
        "Content-Type": "application/json"
      },
      payload: JSON.stringify({ links: linksArray }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseText = response.getContentText();
    
    console.log("Supabase response:", responseText);
    
    if (response.getResponseCode() !== 200) {
      throw new Error(`HTTP ${response.getResponseCode()}: ${responseText}`);
    }
    
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Supabase save error:", error);
    throw error;
  }
}

function updateSupabaseRecord(linkId, shortUrl) {
  try {
    const url = `https://msrfiyovfhgyzeivrtlr.supabase.co/rest/v1/utm_links?id=eq.${linkId}`;
    
    const options = {
      method: "PATCH",
      headers: {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcmZpeW92ZmhneXplaXZydGxyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjEyNTU5OSwiZXhwIjoyMDY3NzAxNTk5fQ.e03QSD2bFS0vG0UP2r3Kgn4HjiF1F3uqDKxCyGiQxNA",
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcmZpeW92ZmhneXplaXZydGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMjU1OTksImV4cCI6MjA2NzcwMTU5OX0.33r7uOriWmhBowdeTDG7Sgewj2-0Y_vJByUtxirkyoM"
      },
      payload: JSON.stringify({ short_url: shortUrl }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    console.log(`Update response code: ${responseCode}`);
    
    if (responseCode === 200 || responseCode === 204) {
      return { success: true };
    } else {
      console.error(`Update failed with code ${responseCode}: ${response.getContentText()}`);
      return { success: false, error: response.getContentText() };
    }
  } catch (error) {
    console.error("Supabase update error:", error);
    return { success: false, error: error.message };
  }
}

function updateSpreadsheet(sheet, rowIndex, utm_link, short_link) {
  sheet.getRange(rowIndex, 9).setValue(utm_link);       // Column I (UTM Link)
  sheet.getRange(rowIndex, 10).setValue(short_link);    // Column J (Short Link)
  sheet.getRange(rowIndex, 11).setValue(short_link ? "✅ Success" : "❌ Short link error"); // Column K (Status)
}
