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

// Sources to check (in order of speed)
const SOURCES = [
    { name: 'LottoPCSO', url: 'https://www.lottopcso.com/' },
    { name: 'LottoResult', url: 'https://lottopcso.com/' } // Fallback/Alias if needed
];

// Helper: Download existing data
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
    console.log("⚡ Starting REAL-TIME Scraper (2PM/5PM/9PM Schedule)...");
    
    let currentData = await fetchExistingData(LIVE_DATA_URL);
    console.log(`💾 Loaded ${currentData.length} existing entries.`);

    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
    
    // We only care about 2D and 3D for real-time updates
    // We will find these keywords on the homepage
    const targetKeywords = ['2D', '3D', 'Swertres', 'EZ2'];
    
    let newCount = 0;

    try {
        // Go to LottoPCSO.com
        console.log(`🌐 Navigating to LottoPCSO.com...`);
        await page.goto('https://www.lottopcso.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for the results to load
        await wait(3000);

        // Extract data from the homepage
        // LottoPCSO usually lists them as text blocks or tables.
        // We look for patterns like "3D Lotto 11AM: 1-2-3"
        
        const results = await page.evaluate(() => {
            const items = [];
            const text = document.body.innerText;

            // Regex to find patterns like:
            // "3D Lotto 11AM: 1-2-3" or "Swertres 11AM: 1-2-3"
            // "2D Lotto 11AM: 1-2" or "EZ2 11AM: 1-2"
            
            // Pattern: Game Name + Time + Numbers
            const regex = /(3D|Swertres|2D|EZ2)\sLotto\s(11AM|4PM|9PM|11:00\sAM|4:00\sPM|9:00\sPM)[:\s]+(\d{1,2}[-\s]\d{1,2}[-\s]\d{1,2}|\d{1,2}[-\s]\d{1,2})/gi;
            
            let match;
            while ((match = regex.exec(text)) !== null) {
                let game = match[1].replace('Swertres', '3D').replace('EZ2', '2D');
                // Normalize Game Name
                if(game === '3D') game = '3D Lotto';
                if(game === '2D') game = '2D Lotto';
                
                let time = match[2].replace(':00', '').replace(' ', ''); // Normalize "11 AM" -> "11AM"
                
                // Construct full name e.g., "3D Lotto 11AM"
                const fullGameName = `${game} ${time}`;
                
                let numbers = match[3].replace(/\s/g, '-'); // Normalize spaces to dashes
                
                // We don't have prize/winners here, set defaults
                items.push({
                    game: fullGameName,
                    combination: numbers,
                    prize: '₱ 4,500', // Default estimated prize
                    winners: 'TBA',    // Default
                    date: new Date().toISOString().split('T')[0] // Today's date
                });
            }
            return items;
        });

        console.log(`🔍 Found ${results.length} potential live results.`);

        // Process found results
        results.forEach(item => {
            // Check if we already have this
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

        // Sort and Save
        currentData.sort((a, b) => {
            const getTs = (str) => {
                const parts = str.split('-');
                return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
            };
            return getTs(b.date) - getTs(a.date);
        });

        if (newCount > 0) {
            if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
            console.log(`💾 Added ${newCount} new entries.`);
        } else {
            console.log("✅ No new updates found.");
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
        // Don't exit with error code to allow retry later
    }

    await browser.close();
})();
