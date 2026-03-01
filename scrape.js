// scrape.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// 1. CONFIGURATION
const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const PCSO_URL = 'https://www.pcso.gov.ph/SearchLottoResult.aspx';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 2. GAMES MAP
const GAMES = [
    { id: '18', name: 'Ultra Lotto 6/58' },
    { id: '17', name: 'Grand Lotto 6/55' },
    { id: '1',  name: 'Super Lotto 6/49' },
    { id: '2',  name: 'Mega Lotto 6/45' },
    { id: '13', name: 'Lotto 6/42' },
    { id: '5',  name: '6D Lotto' },
    { id: '6',  name: '4D Lotto' },
    { id: '8',  name: '3D Lotto 11AM' },
    { id: '9',  name: '3D Lotto 4PM' },
    { id: '10', name: '3D Lotto 9PM' },
    { id: '15', name: '2D Lotto 11AM' },
    { id: '16', name: '2D Lotto 4PM' },
    { id: '11', name: '2D Lotto 9PM' }
];

(async () => {
    console.log("🚀 Starting Full PCSO Scraper (Cloud Mode)...");
    
    const browser = await puppeteer.launch({ 
        headless: 'new', // Optimized for cloud
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage' // Helps with memory on servers
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setDefaultTimeout(60000); // 60s timeout

    try {
        console.log("🌐 Navigating to PCSO...");
        await page.goto(PCSO_URL, { waitUntil: 'networkidle2' });

        // --- DATE LOGIC: LAST 30 DAYS ---
        const now = new Date();
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        // To Date = Today
        const toMonth = months[now.getMonth()];
        const toYear = now.getFullYear().toString();
        const toDay = now.getDate().toString();

        // From Date = 30 Days Ago
        const past = new Date();
        past.setDate(past.getDate() - 30);
        const fromMonth = months[past.getMonth()];
        const fromYear = past.getFullYear().toString();
        const fromDay = past.getDate().toString();

        console.log(`📅 Set Range: ${fromMonth} ${fromDay} TO ${toMonth} ${toDay}`);

        // Load existing data (if any)
        let currentData = [];
        // Note: In GitHub Actions, we start fresh usually, but logic remains
        // We will just merge into memory.

        let totalNew = 0;

        // Loop through games
        for (const game of GAMES) {
            console.log(`🔍 Scraping ${game.name}...`);

            try {
                // Set FROM Date
                await page.select('#cphContainer_cpContent_ddlStartMonth', fromMonth);
                await page.select('#cphContainer_cpContent_ddlStartYear', fromYear);
                await page.select('#cphContainer_cpContent_ddlStartDate', fromDay);

                // Set TO Date
                await page.select('#cphContainer_cpContent_ddlEndMonth', toMonth);
                await page.select('#cphContainer_cpContent_ddlEndYear', toYear);
                await page.select('#cphContainer_cpContent_ddlEndDay', toDay);

                // Select Game
                await page.select('#cphContainer_cpContent_ddlSelectGame', game.id);

                // Click Search
                await page.evaluate(() => document.querySelector('#cphContainer_cpContent_btnSearch').click());

                // Wait for table
                await wait(5000); 

                // Extract
                const results = await page.evaluate(() => {
                    const items = [];
                    const table = document.querySelector('#cphContainer_cpContent_GridView1');
                    if (!table) return items;
                    
                    table.querySelectorAll('tr').forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 5) {
                            const game = cells[0].innerText.trim();
                            const dateStr = cells[1].innerText.trim();
                            const combo = cells[2].innerText.trim();
                            const prize = cells[3].innerText.trim();
                            const winners = cells[4].innerText.trim();

                            let dateFormatted = dateStr;
                            const parts = dateStr.split('/');
                            if (parts.length === 3) dateFormatted = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;

                            items.push({ date: dateFormatted, game, combination: combo, prize: `₱ ${prize}`, winners });
                        }
                    });
                    return items;
                });

                // Merge
                let count = 0;
                results.forEach(item => {
                    if (!currentData.some(i => i.date === item.date && i.combination === item.combination)) {
                        currentData.push(item);
                        count++;
                    }
                });
                if (count > 0) console.log(`   ✅ Added ${count} entries.`);
                
            } catch (e) {
                console.log(`   ❌ Error on ${game.name}: ${e.message}`);
            }
        }

               // Sort by date descending
        currentData.sort((a, b) => new Date(b.date) - new Date(a.date));

        // --- SAVE FILE ---
        
        // SAFETY CHECK: If we found 0 new results, STOP. Do not overwrite server data with empty file.
        if (currentData.length === 0) {
            console.log("⚠️ WARNING: No data found. Scraper was likely blocked or site is down.");
            console.log("🛑 Aborting upload to prevent data loss on server.");
            return; // Exit without saving
        }

        // 1. Create directory if it doesn't exist
        if (!fs.existsSync(OUTPUT_DIR)){
            fs.mkdirSync(OUTPUT_DIR);
        }

        // 2. Write file
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Saved ${currentData.length} entries to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error("❌ Fatal Error:", error.message);
        process.exit(1); // Exit with error code so Action fails
    }

    await browser.close();
})();

