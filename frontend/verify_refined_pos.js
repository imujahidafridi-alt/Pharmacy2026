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

  // Take screenshot of empty workstation before typing
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'pos_refined_empty.png') });
  console.log('Saved pos_refined_empty.png');

  // 1. Search suggestions test
  const searchInput = await page.$('input[placeholder*="Scan barcode"], input[type="text"]');
  if (searchInput) {
    console.log('Typing fla into search to test suggestions...');
    await searchInput.click();
    await searchInput.type('fla');
    await new Promise((r) => setTimeout(r, 700));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'pos_search_suggestions_balanced.png') });
    console.log('Saved pos_search_suggestions_balanced.png');

    // Clear search
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 300));
  }

  // 2. Add items to cart
  if (searchInput) {
    console.log('Adding Brufen...');
    await searchInput.click();
    await searchInput.type('Brufen');
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press('ArrowDown');
    await new Promise((r) => setTimeout(r, 200));
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 800));

    console.log('Adding Augmentin...');
    await searchInput.click();
    await searchInput.type('Augmentin');
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press('ArrowDown');
    await new Promise((r) => setTimeout(r, 200));
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 800));

    console.log('Adding Arinac...');
    await searchInput.click();
    await searchInput.type('Arinac');
    await new Promise((r) => setTimeout(r, 600));
    await page.keyboard.press('ArrowDown');
    await new Promise((r) => setTimeout(r, 200));
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 800));
  }

  // Click tender chip 1,000
  const chipButtons = await page.$$('button');
  for (const btn of chipButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.trim() === '1,000') {
      console.log('Clicking 1,000 tender chip...');
      await btn.click();
      await new Promise((r) => setTimeout(r, 400));
      break;
    }
  }

  // Take screenshot of filled workstation
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'pos_refined_dual_pane_clean.png') });
  console.log('Saved pos_refined_dual_pane_clean.png');

  await browser.close();
  console.log('Done!');
})();
