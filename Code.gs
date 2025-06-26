const NEW_SPREADSHEET_ID = "1elkg5vbdzyaV09SejZW0PAWV_mfcFsJrqCrm76bl_mQ"; // Your Raw Material Spreadsheet ID
const DATA_ENTRY_SHEET_NAME = "1234"; // Your Raw Material Target Sheet
const MASTER_SHEET_NAME = "Sheet1"; // Assuming this sheet exists and has data for dropdowns

// --- Column Header Configuration (EXACTLY matches your Google Sheet headers) ---
// This defines the order and names of all columns that will be written to the Google Sheet.
// It's CRITICAL that your sheet's first row matches this order and spelling.
// If the sheet is empty, these headers will be created automatically.
const SHEET_HEADERS_ORDER = [
  "Timestamp",
  "Email Address",
  "Vendor Name",
  "Challan Type",
  "Account Name",
  "RAW MATERIALs",
  "Outsource Process",
  "Item Description",
  "QTY",
  "UOM",
  "Vehicle No.",
  "Driver's Contact No.",
  "WOS Ref #",
  "Work Order Ref. #",
  "Notes/ Remarks",
  "Vendor Address",
  "Vendor Gst",
  "Contact Details",
  "Pan no",
  "Contact Person",
  "Challan Number"
];

/**
 * Helper function to get a sheet by name.
 * Throws an error if the sheet is not found.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss The SpreadsheetApp instance.
 * @param {string} sheetName The name of the sheet to get.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The requested sheet.
 */
function getSheet(ss, sheetName) {
  if (!ss) {
    Logger.log("Error: SpreadsheetApp instance (ss) is undefined or null in getSheet.");
    throw new Error("Cannot access spreadsheet. The SpreadsheetApp instance is not properly initialized.");
  }
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`Error: Sheet "${sheetName}" not found in spreadsheet ID: ${ss.getId()}.`);
    throw new Error(`Google Sheet "${sheetName}" not found. Please create it manually with the correct name.`);
  }
  return sheet;
}

/**
 * Get vendor names from Sheet1 column D (column 4)
 */
function getVendorNames() {
  try {
    const ss = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
    const sheet = getSheet(ss, MASTER_SHEET_NAME);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log(`No data found in column D of '${MASTER_SHEET_NAME}'.`);
      return [];
    }
    // Use getDisplayValues to ensure consistency with text format
    const values = sheet.getRange(2, 4, lastRow - 1, 1).getDisplayValues().flat().filter(v => v);
    Logger.log(`Fetched Vendor Names: ${JSON.stringify(values)}`);
    return [...new Set(values)];
  } catch (error) {
    Logger.log(`Error fetching vendor names: ${error.message}`);
    return [];
  }
}

/**
 * Get raw material options from Sheet1 column Y (column 25)
 */
function getRawMaterials() {
  try {
    const ss = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
    const sheet = getSheet(ss, MASTER_SHEET_NAME);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log(`No data found in column Y of '${MASTER_SHEET_NAME}'.`);
      return [];
    }
    // Use getDisplayValues to ensure consistency with text format
    const values = sheet.getRange(2, 25, lastRow - 1, 1).getDisplayValues().flat().filter(v => v);
    Logger.log(`Fetched Raw Materials: ${JSON.stringify(values)}`);
    return [...new Set(values)];
  } catch (error) {
    Logger.log(`Error fetching raw materials: ${error.message}`);
    return [];
  }
}

/**
 * Handles GET requests to the web app.
 * If action=getVendorNames or action=getRawMaterials, returns respective names as JSON.
 * Otherwise, returns a simple message.
 * @param {GoogleAppsScript.Events.DoGet} e The event object.
 */
function doGet(e) {
  const action = e.parameter.action;
  Logger.log(`doGet called with action: ${action}`);

  if (action === 'getVendorNames') {
    const vendors = getVendorNames();
    return ContentService.createTextOutput(JSON.stringify({ success: true, vendors: vendors }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getRawMaterials') {
    const materials = getRawMaterials();
    return ContentService.createTextOutput(JSON.stringify({ success: true, materials: materials }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Invalid action provided." })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles POST requests from the HTML form.
 * This function expects a raw JSON body in e.postData.contents.
 * It iterates through each raw material item and appends a row to the sheet.
 * @param {GoogleAppsScript.Events.DoPost} e The event object containing form data.
 */
function doPost(e) {
  Logger.log("=== doPost START ===");
  Logger.log(`Raw event object: ${JSON.stringify(e, null, 2)}`);

  let response = { status: "error", message: "An unknown error occurred." };

  try {
    // Expect raw JSON body in e.postData.contents (simplest approach for HTML body submission)
    const rawData = e.postData.contents;
    if (!rawData) {
      throw new Error("No raw JSON data received in e.postData.contents. Ensure HTML Content-Type is 'application/json' and body is directly JSON.");
    }
    const unifiedPayload = JSON.parse(rawData);
    Logger.log("Parsed unifiedPayload: " + JSON.stringify(unifiedPayload));

    // FIXED: Use NEW_SPREADSHEET_ID instead of getActiveSpreadsheet()
    const ss = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
    const sheet = getSheet(ss, DATA_ENTRY_SHEET_NAME);

    // Prepare common fields that apply to all rows (excluding the 'items' array)
    const commonFields = {};
    for (const key in unifiedPayload) {
      if (key !== "items") { // Exclude 'items' array from commonFields
        commonFields[key] = unifiedPayload[key];
      }
    }
    Logger.log("Common Fields: " + JSON.stringify(commonFields));

    const items = Array.isArray(unifiedPayload.items) ? unifiedPayload.items : [];
    let rowsAddedCount = 0;

    if (items.length === 0) {
      Logger.log("No raw material items found. Appending single row with blank item details.");
      
      // Construct the row data ensuring all SHEET_HEADERS_ORDER columns are present
      const rowDataForSheet = {};
      SHEET_HEADERS_ORDER.forEach(header => {
        if (["RAW MATERIALs", "Item Description", "QTY", "UOM"].includes(header)) {
          // These are item-specific, so they will be blank for a no-item entry
          rowDataForSheet[header] = "";
        } else {
          // All other fields come from commonFields
          rowDataForSheet[header] = commonFields[header] !== undefined ? commonFields[header] : "";
        }
      });
      
      appendToGoogleSheet(rowDataForSheet, sheet);
      rowsAddedCount++;
    } else {
      Logger.log(`Processing ${items.length} raw material items.`);
      items.forEach(item => {
        // For each item, construct the row data by merging common fields with item-specific data
        const rowDataForSheet = {};
        SHEET_HEADERS_ORDER.forEach(header => {
          if (["RAW MATERIALs", "Item Description", "QTY", "UOM"].includes(header)) {
            // These are item-specific fields, get from current item
            rowDataForSheet[header] = item[header] !== undefined ? item[header] : "";
          } else {
            // All other fields come from commonFields
            rowDataForSheet[header] = commonFields[header] !== undefined ? commonFields[header] : "";
          }
        });

        appendToGoogleSheet(rowDataForSheet, sheet);
        rowsAddedCount++;
      });
    }

    response = {
      status: "success",
      message: `${rowsAddedCount} row(s) added successfully.`
    };

  } catch (error) {
    Logger.log(`CRITICAL ERROR in doPost: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    response = {
      status: "error",
      message: `Server error: ${error.message}. Please check Apps Script logs.`
    };
  } finally {
    Logger.log(`Final response: ${JSON.stringify(response)}`);
    Logger.log("=== doPost END ===");
  }

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Appends data to the Google Sheet.
 * This function creates headers if the sheet is empty, then appends the row
 * based on the predefined SHEET_HEADERS_ORDER.
 * @param {object} data An object where keys match SHEET_HEADERS_ORDER and values are cell data.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The target sheet.
 */
function appendToGoogleSheet(data, sheet) {
  Logger.log(`[appendToGoogleSheet] Starting with data: ${JSON.stringify(data)}`);
  
  let currentHeaders = [];
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  Logger.log(`[appendToGoogleSheet] Sheet lastRow: ${lastRow}, lastColumn: ${lastColumn}`);

  // Check if headers exist - FIXED LOGIC
  let hasValidHeaders = false;
  if (lastRow > 0 && lastColumn > 0) {
    try {
      currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
      Logger.log(`[appendToGoogleSheet] Raw headers from sheet: ${JSON.stringify(currentHeaders)}`);
      
      // Check if we have meaningful headers (not just empty strings or nulls)
      hasValidHeaders = currentHeaders.some(header => header && header.toString().trim() !== "");
      Logger.log(`[appendToGoogleSheet] Has valid headers: ${hasValidHeaders}`);
    } catch (error) {
      Logger.log(`[appendToGoogleSheet] Error reading headers: ${error.message}`);
      hasValidHeaders = false;
    }
  }
  
  // Create headers if needed
  if (!hasValidHeaders) {
    Logger.log("[appendToGoogleSheet] Creating new headers based on SHEET_HEADERS_ORDER.");
    try {
      // Clear any existing content in the first row
      if (lastColumn > 0) {
        sheet.getRange(1, 1, 1, Math.max(lastColumn, SHEET_HEADERS_ORDER.length)).clearContent();
      }
      
      // Set the new headers
      sheet.getRange(1, 1, 1, SHEET_HEADERS_ORDER.length).setValues([SHEET_HEADERS_ORDER]);
      currentHeaders = SHEET_HEADERS_ORDER;
      Logger.log(`[appendToGoogleSheet] Headers created successfully: ${JSON.stringify(SHEET_HEADERS_ORDER)}`);
    } catch (error) {
      Logger.log(`[appendToGoogleSheet] Error creating headers: ${error.message}`);
      throw new Error(`Failed to create headers: ${error.message}`);
    }
  } else {
    Logger.log(`[appendToGoogleSheet] Using existing headers: ${JSON.stringify(currentHeaders)}`);
  }

  // Validate header alignment
  if (currentHeaders.length !== SHEET_HEADERS_ORDER.length) {
    Logger.log(`[appendToGoogleSheet] WARNING: Sheet headers count (${currentHeaders.length}) does not match expected count (${SHEET_HEADERS_ORDER.length})`);
    Logger.log(`[appendToGoogleSheet] Current Headers: ${JSON.stringify(currentHeaders)}`);
    Logger.log(`[appendToGoogleSheet] Expected Order: ${JSON.stringify(SHEET_HEADERS_ORDER)}`);
  }

  // Map data values to header columns using the fixed SHEET_HEADERS_ORDER
  const rowDataArray = SHEET_HEADERS_ORDER.map((header) => {
    let value = data[header] !== undefined ? data[header] : "";
    
    // Handle Timestamp conversion from ISO string to Date object
    if (header === "Timestamp" && typeof value === 'string' && value) {
      try {
        value = new Date(value);
        Logger.log(`[appendToGoogleSheet] Converted timestamp: ${value}`);
      } catch (e) {
        Logger.log(`[appendToGoogleSheet] Error converting timestamp '${value}': ${e.message}`);
        // Keep original value if conversion fails
      }
    }
    
    return value;
  });

  Logger.log(`[appendToGoogleSheet] Row data array: ${JSON.stringify(rowDataArray)}`);

  try {
    sheet.appendRow(rowDataArray);
    Logger.log(`[appendToGoogleSheet] Successfully appended row`);
  } catch (error) {
    Logger.log(`[appendToGoogleSheet] Error appending row: ${error.message}`);
    throw new Error(`Failed to append row: ${error.message}`);
  }
}


/**
 * --- TEST FUNCTION FOR doPost ---
 * Run this function from the Apps Script editor to simulate a form submission.
 * This simulates the exact JSON structure sent by the HTML form.
 */
function testDoPost() {
  Logger.log("=== TESTING doPost ===");

  // This simulated data structure now exactly matches the `unifiedPayload`
  // generated by the HTML form's `handleFormSubmit` function.
  const simulatedUnifiedPayload = {
    "Timestamp": new Date().toISOString(), // Use ISO string for testing
    "Email Address": "test-user-simulated@example.com",
    "Vendor Name": "Simulated Vendor Inc.",
    "Challan Type": "Outward",
    "Account Name": "Test Account Dept",
    "Outsource Process": "Finishing Process",
    "Vehicle No.": "MH04CD5678",
    "Driver's Contact No.": "9988776655",
    "WOS Ref #": "SIM-WOS-TEST-001",
    "Work Order Ref. #": "SIM-WO-XYZ-001",
    "Notes/ Remarks": "This is a simulated entry with multiple items.",
    "Vendor Address": "Simulated Address 123, Test City", 
    "Vendor Gst": "SIMGST1234ABCD",    
    "Contact Details": "simulated@vendor.com", 
    "Pan no": "SIMPAN1234E",        
    "Contact Person": "Simulated Person",
    "Challan Number": "SIM-CH-001", 
    items: [
      {
        "RAW MATERIALs": "Simulated Item A (Steel)",
        "Item Description": "Hot Rolled Sheet, 3mm",
        "QTY": 100,
        "UOM": "KG"
      },
      {
        "RAW MATERIALs": "Simulated Item B (Plastic)",
        "Item Description": "ABS Granules",
        "QTY": 50,
        "UOM": "Bag"
      }
    ]
  };

  // Simulate an 'e' object where postData.contents directly holds the JSON string
  const e = {
    postData: {
      contents: JSON.stringify(simulatedUnifiedPayload),
      type: "application/json" // Reflects the Content-Type we want HTML to send
    }
  };

  Logger.log("Simulating doPost with test data...");
  const result = doPost(e); // Call the actual doPost function
  Logger.log(`Test result: ${result.getContent()}`);
  Logger.log("=== TEST COMPLETE ===");
}

/**
 * --- TEST FUNCTION FOR doGet (Vendor Names) ---
 */
function testDoGetVendorNames() {
  Logger.log("Running testDoGetVendorNames...");
  const e = { parameter: { action: 'getVendorNames' } };
  const result = doGet(e);
  Logger.log(`doGet Vendor Names Result: ${result.getContent()}`);
}

/**
 * --- TEST FUNCTION FOR doGet (Raw Materials) ---
 */
function testDoGetRawMaterials() {
  Logger.log("Running testDoGetRawMaterials...");
  const e = { parameter: { action: 'getRawMaterials' } };
  const result = doGet(e);
  Logger.log(`doGet Raw Materials Result: ${result.getContent()}`);
}

/**
 * Function to check sheet structure and permissions
 */
function debugSheetStructure() {
  Logger.log("=== DEBUGGING SHEET STRUCTURE ===");
  
  try {
    const ss = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
    Logger.log("✓ Spreadsheet accessible");
    
    const sheets = ss.getSheets();
    Logger.log(`Available sheets: ${sheets.map(s => s.getName()).join(', ')}`);
    
    const targetSheet = ss.getSheetByName(DATA_ENTRY_SHEET_NAME);
    if (!targetSheet) {
      Logger.log(`❌ Target sheet '${DATA_ENTRY_SHEET_NAME}' not found`);
      return;
    }
    
    Logger.log("✓ Target sheet found");
    
    const lastRow = targetSheet.getLastRow();
    const lastCol = targetSheet.getLastColumn();
    Logger.log(`Sheet dimensions: ${lastRow} rows, ${lastCol} columns`);
    
    // Check for headers
    let headersFound = false;
    if (lastRow > 0 && lastCol > 0) {
      const existingHeaders = targetSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      if (existingHeaders && existingHeaders.some(h => h && h.toString().trim() !== "")) {
        headersFound = true;
        Logger.log(`Headers found: ${JSON.stringify(existingHeaders)}`);
      }
    }

    if (!headersFound) {
      Logger.log("Sheet is empty or no valid headers found. Headers will be created on first successful `appendToGoogleSheet` call.");
    }
    
    // Test write permissions
    try {
      const testData = {};
      SHEET_HEADERS_ORDER.forEach(header => {
        testData[header] = `TEST_${header}`;
      });
      
      Logger.log("Testing write permissions...");
      appendToGoogleSheet(testData, targetSheet);
      Logger.log("✓ Write test successful (1 row appended)");
      
      // Clean up test row
      const newLastRow = targetSheet.getLastRow();
      if (newLastRow > 1) {
        targetSheet.deleteRow(newLastRow);
        Logger.log("Cleaned up test row.");
      }
    } catch (writeError) {
      Logger.log(`❌ Write test failed: ${writeError.message}`);
    }
    
  } catch (error) {
    Logger.log(`❌ Sheet access error: ${error.message}`);
  }
  
  Logger.log("=== DEBUG COMPLETE ===");
}

/**
 * Optional: Clean up test data
 */
function cleanupTestData() {
  const ss = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(DATA_ENTRY_SHEET_NAME);
  
  if (sheet && sheet.getLastRow() > 1) {
    const rowsToDelete = 2; 
    const startRowToDelete = sheet.getLastRow() - rowsToDelete + 1;
    if (startRowToDelete > 1) {
      sheet.deleteRows(startRowToDelete, rowsToDelete);
      Logger.log(`Deleted ${rowsToDelete} test data rows.`);
    } else {
      Logger.log("Not enough rows to delete test data without affecting headers. Manual cleanup may be required.");
    }
  } else {
    Logger.log("No data or sheet not found for cleanup.");
  }
}
