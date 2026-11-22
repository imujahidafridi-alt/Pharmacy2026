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

    // Ensure Dark Mode
    let currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
    if (currentTheme !== 'dark') {
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('pharmacy_theme', 'dark');
      });
      await new Promise(r => setTimeout(r, 400));
    }

    // 1. Click "Customers" tab in the navbar
    console.log('Switching to Customers tab...');
    await page.evaluate(() => {
      const navLinks = Array.from(document.querySelectorAll('a, button'));
      const custTab = navLinks.find(el => el.textContent && el.textContent.trim() === 'Customers');
      if (custTab) custTab.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Screenshot 1: Customer Khata Dashboard
    const screenDashboard = path.join(ARTIFACTS_DIR, 'khata_dashboard_dark.png');
    await page.screenshot({ path: screenDashboard });
    console.log(`Saved screenshot 1 (Khata Dashboard): ${screenDashboard}`);

    // 2. Open Receive Payment Modal for first customer with due balance
    console.log('Clicking Receive Payment button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const payBtn = buttons.find(b => b.textContent && b.textContent.includes('Receive Payment') && !b.disabled);
      if (payBtn) payBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Screenshot 2: Receive Payment Modal
    const screenWasooli = path.join(ARTIFACTS_DIR, 'khata_wasooli_modal.png');
    await page.screenshot({ path: screenWasooli });
    console.log(`Saved screenshot 2 (Receive Payment Modal): ${screenWasooli}`);

    // 3. Save Payment to generate Receipt slip
    console.log('Saving payment...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const saveBtn = buttons.find(b => b.textContent && b.textContent.includes('Save Payment'));
      if (saveBtn) saveBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Screenshot 3: Wasooli Receipt Thermal Slip
    const screenSlip = path.join(ARTIFACTS_DIR, 'khata_wasooli_slip_80mm.png');
    await page.screenshot({ path: screenSlip });
    console.log(`Saved screenshot 3 (Wasooli Slip): ${screenSlip}`);

    // Close Wasooli slip
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 600));

    // 4. Open Ledger Statement for Dr. Tariq Mahmood (who has transactions)
    console.log('Opening Ledger Statement for Dr. Tariq Mahmood...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const tariqRow = rows.find(r => r.textContent && r.textContent.includes('Tariq'));
      if (tariqRow) {
        const buttons = Array.from(tariqRow.querySelectorAll('button'));
        const ledgerBtn = buttons.find(b => b.textContent && b.textContent.includes('Ledger'));
        if (ledgerBtn) ledgerBtn.click();
      }
    });
    await new Promise(r => setTimeout(r, 1000));

    // Screenshot 4: Ledger Statement Modal with real transactions
    const screenLedger = path.join(ARTIFACTS_DIR, 'khata_ledger_statement.png');
    await page.screenshot({ path: screenLedger });
    console.log(`Saved screenshot 4 (Ledger Statement): ${screenLedger}`);

    console.log('Customer Khata Module verification complete!');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
}

run();
