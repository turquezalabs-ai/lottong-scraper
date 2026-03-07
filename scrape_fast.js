// scrape_fast.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const URL = 'https://www.lottoresult.com.ph/'; // REAL TIME SOURCE

(async () => {
    console.log("🚀 Starting FAST Scraper (Source: LottoResult.ph)...");
    
    let currentData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        currentData = JSON.parse(fs.readFileSync(OUTPUT_FILE));
    }

    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setDefaultTimeout(60000);

    try {
        console.log(`🌐 Navigating to ${URL}...`);
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 0 });

        // Wait for the results table
        await page.waitForSelector('table.lotto-res-table', { timeout: 10000 });

        const results = await page.evaluate(() => {
            const items = [];
            const rows = document.querySelectorAll('table.lotto-res-table tr');
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    // Structure: Game | Combination | Date | Prize
                    const game = cells[0]?.innerText.trim();
                    const combo = cells[1]?.innerText.trim();
                    const dateRaw = cells[2]?.innerText.trim();
                    const prize = cells[3]?.innerText.trim();
                    
                    if (game && combo && dateRaw) {
                        items.push({ game, combination: combo, date: dateRaw, prize, winners: '0' });
                    }
                }
            });
            return items;
        });

        console.log(`Found ${results.length} rows.`);

        let newCount = 0;
        results.forEach(item => {
            // Standardize Date (Format: Month DD, YYYY -> YYYY-MM-DD)
            let dateFormatted = item.date;
            const dateObj = new Date(item.date);
            if (!isNaN(dateObj)) {
                dateFormatted = dateObj.toISOString().split('T')[0];
            }

            // Standardize Game Name
            let gameName = item.game.toUpperCase();
            if (gameName.includes('ULTRA')) gameName = '6/58 Lotto';
            else if (gameName.includes('GRAND')) gameName = '6/55 Lotto';
            else if (gameName.includes('SUPER')) gameName = '6/49 Lotto';
            else if (gameName.includes('MEGA')) gameName = '6/45 Lotto';
            else if (gameName.includes('6/42')) gameName = '6/42 Lotto';
            else if (gameName.includes('SWERTRES') || gameName.includes('3D')) gameName = '3D Lotto';
            else if (gameName.includes('EZ2') || gameName.includes('2D')) gameName = '2D Lotto';
            else if (gameName.includes('6D')) gameName = '6D Lotto';
            else if (gameName.includes('4D')) gameName = '4D Lotto';

            const exists = currentData.some(i => i.date === dateFormatted && i.game === gameName);
            if (!exists && gameName && dateFormatted) {
                currentData.push({
                    game: gameName,
                    date: dateFormatted,
                    combination: item.combination,
                    prize: item.prize,
                    winners: '0' // Fast source often lacks this
                });
                newCount++;
            }
        });

        if (newCount > 0) {
            console.log(`✅ Added ${newCount} new entries.`);
            currentData.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        } else {
            console.log("ℹ️ No new entries found.");
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1); // Exit with error code to trigger notification
    }

    await browser.close();
})();