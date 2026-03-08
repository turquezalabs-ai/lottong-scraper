// scrape_fast.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');

// LIST OF SOURCES (Order matters: Try top one first)
const SOURCES = [
    {
        url: 'https://www.lottoresult.com.ph/',
        name: 'LottoResult.ph',
        parser: parseLottoResultPh
    },
    {
        url: 'https://www.lottopcso.com/',
        name: 'LottoPCSO.com',
        parser: parseLottoPcso
    }
];

(async () => {
    console.log("🚀 Starting FAST Scraper...");
    
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

    let finalResults = [];
    let successSource = null;

    // LOOP THROUGH SOURCES
    for (const source of SOURCES) {
        console.log(`🌐 Trying Source: ${source.name}...`);
        try {
            await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 0 });
            
            // Wait for generic containers
            try {
                await page.waitForSelector('table, .result-card, .lotto-results', { timeout: 5000 });
            } catch (e) {
                console.log(`   ⚠️ Structure not found for ${source.name}.`);
            }

            // Run the specific parser for this site
            const results = await source.parser(page);
            
            if (results && results.length > 0) {
                console.log(`   ✅ Found ${results.length} results on ${source.name}.`);
                finalResults = results;
                successSource = source.name;
                break; // STOP LOOP if we got data
            } else {
                console.log(`   ❌ No results found on ${source.name}.`);
            }

        } catch (error) {
            console.log(`   ❌ Failed to load ${source.name}: ${error.message}`);
        }
    }

    if (finalResults.length === 0) {
        console.log("❌ All sources failed or returned no data.");
        await browser.close();
        process.exit(0);
    }

    // MERGE DATA
    let newCount = 0;
    finalResults.forEach(item => {
        const exists = currentData.some(i => i.date === item.date && i.game === item.game);
        if (!exists) {
            currentData.push(item);
            newCount++;
        }
    });

    if (newCount > 0) {
        console.log(`💾 Added ${newCount} new entries from ${successSource}.`);
        currentData.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
    } else {
        console.log("ℹ️ No new entries added (Database up to date).");
    }

    await browser.close();
})();


// ==========================================
// PARSER 1: LottoResult.ph (Tables)
// ==========================================
async function parseLottoResultPh(page) {
    return await page.evaluate(() => {
        const items = [];
        const rows = document.querySelectorAll('table.lotto-res-table tr, table tr');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
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
}

// ==========================================
// PARSER 2: LottoPCSO.com (Divs/Cards)
// ==========================================
async function parseLottoPcso(page) {
    return await page.evaluate(() => {
        const items = [];
        // Try finding cards or result divs
        const cards = document.querySelectorAll('.result-card, .card, .lotto-result, div[class*="result"]');
        
        cards.forEach(card => {
            // Heuristic search for text
            const text = card.innerText;
            
            // Extract Game
            let game = "";
            const h4 = card.querySelector('h4, h5, .game-name');
            if (h4) game = h4.innerText.trim();
            
            // Extract Combination (Look for numbers)
            let combo = [];
            const numEls = card.querySelectorAll('span.ball, li.ball, div.number');
            if (numEls.length > 0) {
                numEls.forEach(el => combo.push(el.innerText.trim()));
            } else {
                // Fallback: regex for numbers in the text if structure is messy
                // Look for patterns like 12-23-34 or just numbers
                if (text) {
                   // Simple match for 2 or 3 digit numbers
                   const matches = text.match(/\b\d{1,2}\b/g);
                   if (matches && matches.length >= 2) {
                       combo = matches;
                   }
                }
            }
            
            // Extract Date (Look for date patterns)
            let dateRaw = "";
            const small = card.querySelector('small, .date');
            if (small) dateRaw = small.innerText.trim();

            if (game && combo.length > 0) {
                items.push({
                    game: game,
                    combination: combo.join('-'),
                    date: dateRaw,
                    prize: 'Pending',
                    winners: '0'
                });
            }
        });
        return items;
    });
}
