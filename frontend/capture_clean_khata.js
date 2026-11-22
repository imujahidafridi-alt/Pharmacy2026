import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\mujah\\.gemini\\antigravity\\brain\\70e55b33-89d3-4694-885d-ea25547fe1cd';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const executablePath = fs.existsSync(EDGE_PATH) ? EDGE_PATH : CHROME_PATH;

async function run() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768'],
    defaultViewport: { width: 1366, height: 768 }
  });

  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8085/', { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));

    // Ensure dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await new Promise(r => setTimeout(r, 300));

    // Switch to Customers tab
    await page.evaluate(() => {
      const navLinks = Array.from(document.querySelectorAll('a, button'));
      const custTab = navLinks.find(el => el.textContent && el.textContent.trim() === 'Customers');
      if (custTab) custTab.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot 1: Dashboard with active due and WhatsApp button on row
    const screen1 = path.join(ARTIFACTS_DIR, 'khata_dashboard_active_due.png');
    await page.screenshot({ path: screen1 });
    console.log(`Saved screenshot: ${screen1}`);

    // Click Statement on Muhammad Ali Khan
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => r.textContent && r.textContent.includes('Muhammad Ali'));
      if (row) {
        const buttons = Array.from(row.querySelectorAll('button'));
        const stmtBtn = buttons.find(b => b.textContent && b.textContent.includes('Statement'));
        if (stmtBtn) stmtBtn.click();
      }
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot 2: Statement modal with WhatsApp bar
    const screen2 = path.join(ARTIFACTS_DIR, 'khata_statement_with_whatsapp.png');
    await page.screenshot({ path: screen2 });
    console.log(`Saved screenshot: ${screen2}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

run();
