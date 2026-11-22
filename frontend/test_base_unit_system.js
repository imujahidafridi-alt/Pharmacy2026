import puppeteer from 'puppeteer-core';
import fs from 'fs';

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

  // 1. Add 10*Panadol & 2*Brufen
  console.log('Testing POS terminal with 10*Panadol...');
  const searchInput = await page.$('input[placeholder*="Scan or type"], input.pos-search-input, input[type="text"]');
  if (searchInput) {
    await searchInput.click();
    await searchInput.type('10*Panadol');
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 800));

    await searchInput.click();
    await searchInput.type('2*Brufen');
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 800));
  }

  // Screenshot POS Cart (Single Base-Unit Model, no Unit dropdown, no F6)
  await page.screenshot({
    path: `${ARTIFACTS_DIR}/pos_cart_simplified_base_units.png`,
  });
  console.log('Saved pos_cart_simplified_base_units.png');

  // 2. Complete checkout directly from the right-side payment panel
  console.log('Testing F9 checkout...');
  await page.keyboard.press('F9');
  await new Promise((r) => setTimeout(r, 1500));

  // Screenshot Thermal Receipt Modal
  await page.screenshot({
    path: `${ARTIFACTS_DIR}/pos_sale_receipt_base_units.png`,
  });
  console.log('Saved pos_sale_receipt_base_units.png');

  // Close receipt modal
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 600));

  // 3. Navigate to Items Master
  console.log('Navigating to Items tab...');
  await page.evaluate(() => {
    const navs = Array.from(document.querySelectorAll('button, a, .nav-link, span'));
    const itemsTab = navs.find((el) => el.textContent && el.textContent.trim() === 'Items');
    if (itemsTab) itemsTab.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Open "+ Add Item" modal
  console.log('Opening Add Item modal...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addBtn = btns.find((b) => b.textContent && b.textContent.includes('Add Item'));
    if (addBtn) addBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // Screenshot Empty Simplified Add Item Modal
  await page.screenshot({
    path: `${ARTIFACTS_DIR}/add_item_simplified_modal.png`,
  });
  console.log('Saved add_item_simplified_modal.png');

  // Fill in new item details in simplified form
  const nameInput = await page.$('input[placeholder*="Panadol 500mg"]');
  if (nameInput) {
    await nameInput.type('Flysed 40mg Syrup');
  }

  const brandInput = await page.$('input[placeholder*="GSK"]');
  if (brandInput) {
    await brandInput.type('Searle');
  }

  const genericInput = await page.$('input[placeholder*="Paracetamol"]');
  if (genericInput) {
    await genericInput.type('Famotidine');
  }

  const barcodeInput = await page.$('.modal-body input[placeholder*="barcode"]');
  if (barcodeInput) {
    await barcodeInput.type('896400012345');
  }

  const rackInput = await page.$('.modal-body input[placeholder*="A-12"]');
  if (rackInput) {
    await rackInput.type('SYR-03');
  }

  // Cost and Sale Price
  const numInputs = await page.$$('.modal-body input[type="number"]');
  if (numInputs.length >= 3) {
    // numInputs[0] is Pack Size (default 1)
    // numInputs[1] is Cost Price
    await numInputs[1].click();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await numInputs[1].type('85.00');

    // numInputs[2] is Sale Price
    await numInputs[2].click();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await numInputs[2].type('110.00');
  }

  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({
    path: `${ARTIFACTS_DIR}/add_item_filled_modal.png`,
  });
  console.log('Saved add_item_filled_modal.png');

  // Submit modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.modal-footer button'));
    const saveBtn = btns.find((b) => b.textContent && b.textContent.includes('Save Item'));
    if (saveBtn) saveBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  // Clear search input if filled
  await page.evaluate(() => {
    const clearBtn = document.querySelector('button.btn-sm.border-start-0');
    if (clearBtn) clearBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // Screenshot inventory table with Pack Size column
  await page.screenshot({
    path: `${ARTIFACTS_DIR}/medicine_master_pack_size_view.png`,
  });
  console.log('Saved medicine_master_pack_size_view.png');

  await browser.close();
  console.log('Verification script completed successfully.');
})();
