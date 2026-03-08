// scrape_live.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const https = require('https');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const LIVE_DATA_URL = 'https://lottong-pinoy.com/results.json';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchExistingData(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { resolve([]); }
            });
        }).on('error', () => resolve([]));
    });
}

(async () => {
    console.log("⚡ Starting SAFE REAL-TIME Scraper...");
    
    let currentData = await fetchExistingData(LIVE_DATA_URL);
    console.log(`💾 Loaded ${currentData.length} existing entries.`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    let newCount = 0;

    try {
        console.log(`🌐 Navigating...`);
        // Strict timeout: Abort if not loaded in 30s
        await page.goto('https://www.lottopcso.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // SAFE EVALUATE: Limit text size to prevent Regex Hang
        const results = await page.evaluate(() => {
            const items = [];
            // ONLY scan the first 50,000 chars of body text. Prevents infinite loops.
            const text = document.body.innerText.substring(0, 50000);

            // Safe Regex
            const regex = /(3D|Swertres|2D|EZ2)(?:\sLotto)?\s(11AM|4PM|9PM|11:00\s?AM|4:00\s?PM|9:00\s?PM)[:\s]+(\d{1,2}[-\s]\d{1,2}[-\s]\d{1,2}|\d{1,2}[-\s]\d{1,2})/gi;
            
            let match;
            while ((match = regex.exec(text)) !== null) {
                let game = match[1].replace('Swertres', '3D').replace('EZ2', '2D');
                if(game === '3D') game = '3D Lotto';
                if(game === '2D') game = '2D Lotto';
                
                let time = match[2].replace(':00', '').replace(/\s/g, '');
                const fullGameName = `${game} ${time}`;
                let numbers = match[3].replace(/\s/g, '-');
                
                items.push({
                    game: fullGameName,
                    combination: numbers,
                    prize: '₱ 4,500',
                    winners: 'TBA',
                    date: new Date().toISOString().split('T')[0]
                });
            }
            return items;
        });

        console.log(`🔍 Found ${results.length} potential results.`);

        results.forEach(item => {
            const exists = currentData.some(i => 
                i.date === item.date && 
                i.game === item.game &&
                i.combination === item.combination
            );

            if (!exists) {
                currentData.push(item);
                newCount++;
                console.log(`   ✅ NEW: ${item.game} - ${item.combination}`);
            }
        });

        // Sort & Save
        currentData.sort((a, b) => {
            const getTs = (str) => {
                const parts = str.split('-');
                return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
            };
            return getTs(b.date) - getTs(a.date);
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        
        if (newCount > 0) console.log(`💾 Added ${newCount} new entries.`);
        else console.log("✅ No new updates found.");

    } catch (error) {
        console.error("❌ Error:", error.message);
        // Save whatever we loaded to keep FTP happy
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
    }

    await browser.close();
})();
