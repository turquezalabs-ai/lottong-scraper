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
        headless: 'new',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage'
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setDefaultTimeout(60000);

    try {
        console.log("🌐 Navigating to PCSO...");
        await page.goto(PCSO_URL, { waitUntil: 'networkidle2' });

        // --- DATE LOGIC: LAST 30 DAYS ---
        const now = new Date();
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        const toMonth = months[now.getMonth()];
        const toYear = now.getFullYear().toString();
        const toDay = now.getDate().toString();

        const past = new Date();
        past.setDate(past.getDate() - 30);
        const fromMonth = months[past.getMonth()];
        const fromYear = past.getFullYear().toString();
        const fromDay = past.getDate().toString();

        console.log(`📅 Set Range: ${fromMonth} ${fromDay} TO ${toMonth} ${toDay}`);

        let currentData = [];
        let totalNew = 0;

        for (const game of GAMES) {
            console.log(`🔍 Scraping ${game.name}...`);

            try {
                await page.select('#cphContainer_cpContent_ddlStartMonth', fromMonth);
                await page.select('#cphContainer_cpContent_ddlStartYear', fromYear);
                await page.select('#cphContainer_cpContent_ddlStartDate', fromDay);

                await page.select('#cphContainer_cpContent_ddlEndMonth', toMonth);
                await page.select('#cphContainer_cpContent_ddlEndYear', toYear);
                await page.select('#cphContainer_cpContent_ddlEndDay', toDay);

                await page.select('#cphContainer_cpContent_ddlSelectGame', game.id);
                await page.evaluate(() => document.querySelector('#cphContainer_cpContent_btnSearch').click());
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
                            
                            // FIX: SWAPPED INDICES (Combo is [1], Date is [2])
                            const combo = cells[1].innerText.trim();   // Combination is column 2 (index 1)
                            const dateStr = cells[2].innerText.trim(); // Date is column 3 (index 2)
                            
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

        // Sort by date DESCENDING (Newest on Top)
        currentData.sort((a, b) => {
            const getTs = (str) => {
                const parts = str.split('-');
                return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
            };
            return getTs(b.date) - getTs(a.date);
        });

        // --- SAVE FILE ---
        
        if (currentData.length === 0) {
             console.log("⚠️ WARNING: No data found. Scraper was likely blocked.");
             return;
        }

        if (!fs.existsSync(OUTPUT_DIR)){
            fs.mkdirSync(OUTPUT_DIR);
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Saved ${currentData.length} entries (Newest First).`);

    } catch (error) {
        console.error("❌ Fatal Error:", error.message);
        process.exit(1);
    }

    await browser.close();
})();
