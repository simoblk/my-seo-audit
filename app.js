const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// 1. Function bach t-viriifi robots.txt
async function checkRobots(baseUrl) {
    try {
        const resp = await axios.get(`${baseUrl}/robots.txt`, { timeout: 3000 });
        return resp.status === 200;
    } catch { return false; }
}

// 2. Function bach t-checki broken links
async function isLinkBroken(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000,
            validateStatus: () => true // Bach ma-i-crashich f-404
        });
        return response.status !== 200;
    } catch { return true; }
}

app.post('/api/audit', async (req, res) => {
    let { url } = req.body;
    if (!url.startsWith('http')) url = 'https://' + url;

    try {
        const { data: html } = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (SEO-Expert-Bot-2026)' },
            timeout: 10000
        });
        const $ = cheerio.load(html);
        const domain = new URL(url).origin;

        // --- SEO DATA EXTRACTION ---
        const results = {
            title: $('title').text() || "Missing Tag",
            titleLen: $('title').text().length,
            desc: $('meta[name="description"]').attr('content') || "Missing Tag",
            h1Count: $('h1').length,
            images: {
                total: $('img').length,
                missingAlt: $('img:not([alt])').length
            },
            robotsTxt: await checkRobots(domain),
            brokenLinks: []
        };

        // --- BROKEN LINKS CHECKER (Max 15 links bach ma-it-blocach) ---
        const links = [];
        $('a[href^="http"]').each((i, el) => {
            if (i < 15) links.push($(el).attr('href'));
        });

        const checkPromises = links.map(async (link) => {
            const broken = await isLinkBroken(link);
            return broken ? link : null;
        });

        const brokenResults = await Promise.all(checkPromises);
        results.brokenLinks = brokenResults.filter(l => l !== null);

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: "Could not scan this website. Check the URL." });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));