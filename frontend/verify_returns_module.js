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
    await new Promise(r => setTimeout(r, 800));

    // Ensure dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 400));

    // 1. Open Sales Return Modal via clicking 'Alt + W Wapsi' button in keypad
    console.log('Opening Return modal via Alt + W Wapsi button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const wapsiBtn = buttons.find(b => b.textContent && b.textContent.includes('Wapsi'));
      if (wapsiBtn) wapsiBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot 1: Return Modal Search
    const screen1 = path.join(ARTIFACTS_DIR, 'returns_modal_search_dark.png');
    await page.screenshot({ path: screen1 });
    console.log(`Saved screenshot 1: ${screen1}`);

    // 2. Click a recent invoice chip INSIDE the Return modal
    console.log('Selecting an unreturned invoice chip inside the modal...');
    await page.evaluate(() => {
      // Find modal dialog container
      const modal = document.querySelector('.modal-content, [role="dialog"], .modal');
      if (!modal) return;
      const modalButtons = Array.from(modal.querySelectorAll('button'));
      const chip = modalButtons.find(b =>
        b.textContent &&
        b.textContent.includes('INV-') &&
        !b.textContent.includes('Returned')
      );
      if (chip) chip.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot 2: Invoice Loaded in Return Modal
    const screen2 = path.join(ARTIFACTS_DIR, 'returns_invoice_selected_dark.png');
    await page.screenshot({ path: screen2 });
    console.log(`Saved screenshot 2: ${screen2}`);

    // 3. Process Return
    console.log('Executing Return...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const processBtn = buttons.find(b => b.textContent && b.textContent.includes('Process Full Return'));
      if (processBtn) processBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Screenshot 3: Return Voucher Thermal Slip
    const screen3 = path.join(ARTIFACTS_DIR, 'returns_thermal_voucher_80mm.png');
    await page.screenshot({ path: screen3 });
    console.log(`Saved screenshot 3: ${screen3}`);

    console.log('Sales Return Module verification complete!');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
}

run();
