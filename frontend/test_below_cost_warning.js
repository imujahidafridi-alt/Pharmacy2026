import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\mujah\\.gemini\\antigravity\\brain\\70e55b33-89d3-4694-885d-ea25547fe1cd';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = fs.existsSync(EDGE_PATH) ? EDGE_PATH : CHROME_PATH;

(async () => {
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768'],
  });

  const page = await browser.newPage();
  console.log('Navigating to http://127.0.0.1:8085...');
  await page.goto('http://127.0.0.1:8085', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));

  // 1. Add Brufen 400mg
  const searchInput = await page.$('input[placeholder*="Scan barcode"], input[type="text"]');
  if (searchInput) {
    console.log('Adding Brufen...');
    await searchInput.click();
    await searchInput.type('Brufen');
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press('ArrowDown');
    await new Promise((r) => setTimeout(r, 200));
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 800));
  }

  // 2. Change Sale Price to 8.50 (Pack Cost is 480/310)
  console.log('Editing sale price to 8.50 in the cart table...');
  const priceInputs = await page.$$('input[title*="Edit sale price"], input[title*="Warning"]');
  if (priceInputs.length > 0) {
    await priceInputs[0].click({ clickCount: 3 });
    await priceInputs[0].type('8.50');
    await new Promise((r) => setTimeout(r, 300));
    await page.keyboard.press('Tab');
    await new Promise((r) => setTimeout(r, 800));
  }

  // 3. Take screenshot of the streamlined warning dialog!
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'pos_below_cost_streamlined_modal.png') });
  console.log('Saved pos_below_cost_streamlined_modal.png');

  // 4. Test pressing Enter key to use Cost Price
  console.log('Pressing Enter to test Set to Cost Price...');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 800));

  // 5. Screenshot cart to verify it safely reverted to cost price
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'pos_reverted_to_cost.png') });
  console.log('Saved pos_reverted_to_cost.png');

  await browser.close();
  console.log('Done!');
})();
