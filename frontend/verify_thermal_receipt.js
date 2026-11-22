import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\mujah\\.gemini\\antigravity\\brain\\70e55b33-89d3-4694-885d-ea25547fe1cd';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const executablePath = fs.existsSync(EDGE_PATH) ? EDGE_PATH : CHROME_PATH;

async function run() {
  console.log(`Launching browser using: ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768'],
    defaultViewport: { width: 1366, height: 768 }
  });

  try {
    const page = await browser.newPage();
    console.log('Navigating to http://127.0.0.1:8085/ ...');
    await page.goto('http://127.0.0.1:8085/', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    // 1. Check for Reprint Last Bill button
    console.log('Looking for Reprint Last Bill button...');
    const reprintBtn = await page.$('button[title*="Reprint"]');
    if (reprintBtn) {
      console.log('Found Reprint Last Bill button! Clicking it...');
      await reprintBtn.click();
      await new Promise(r => setTimeout(r, 800));

      // 80mm preview screenshot
      const screen80 = path.join(ARTIFACTS_DIR, 'receipt_preview_80mm.png');
      await page.screenshot({ path: screen80 });
      console.log(`Saved screenshot 80mm: ${screen80}`);

      // Toggle to 58mm
      console.log('Switching to 58mm (Mini) paper size...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find(b => b.textContent && b.textContent.includes('58mm'));
        if (target) target.click();
      });
      await new Promise(r => setTimeout(r, 600));

      // 58mm preview screenshot
      const screen58 = path.join(ARTIFACTS_DIR, 'receipt_preview_58mm.png');
      await page.screenshot({ path: screen58 });
      console.log(`Saved screenshot 58mm: ${screen58}`);

      // Close modal
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 500));
    } else {
      console.log('Reprint button not found or no previous invoice yet.');
    }

    // 2. Perform a complete sale to verify F9 Pay & Print Flow
    console.log('Searching item for checkout...');
    const searchInput = await page.$('input[placeholder*="Scan barcode"]');
    if (searchInput) {
      await searchInput.focus();
      await searchInput.type('Panadol');
      await new Promise(r => setTimeout(r, 600));

      // Select first item by pressing Enter
      console.log('Selecting item with Enter key...');
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 500));

      // F9 now completes the sale directly and opens the thermal receipt
      console.log('Triggering F9 Pay & Print...');
      await page.keyboard.press('F9');
      await new Promise(r => setTimeout(r, 1800));

      // Thermal Receipt Modal should now be open!
      const freshReceiptPath = path.join(ARTIFACTS_DIR, 'receipt_checkout_complete.png');
      await page.screenshot({ path: freshReceiptPath });
      console.log(`Saved screenshot checkout receipt: ${freshReceiptPath}`);
    }

    console.log('Thermal receipt verification complete!');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
}

run();
