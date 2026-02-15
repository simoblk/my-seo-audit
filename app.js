const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

// 1. Technical Checks (Robots & Sitemap)
async function checkFile(url) {
    try {
        const resp = await axios.get(url, { timeout: 3000 });
        return resp.status === 200;
    } catch { return false; }
}

// 2. Broken Links Checker
async function isLinkBroken(url) {
    try {
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 4000,
            validateStatus: () => true 
        });
        return response.status !== 200;
    } catch { return true; }
}

app.post('/api/audit', async (req, res) => {
    let { url } = req.body;
    if (!url.startsWith('http')) url = 'https://' + url;

    try {
        const startTime = Date.now();
        const { data: html } = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (SEO-Expert-Bot-2026)' },
            timeout: 10000
        });
        const responseTime = Date.now() - startTime;
        const $ = cheerio.load(html);
        const domain = new URL(url).origin;

        const results = {
            onPage: {
                title: $('title').text() || "Missing",
                desc: $('meta[name="description"]').attr('content') || "Missing",
                h1Count: $('h1').length,
                viewport: $('meta[name="viewport"]').length > 0, // Mobile friendly check
            },
            social: {
                ogTitle: $('meta[property="og:title"]').length > 0,
                ogImg: $('meta[property="og:image"]').length > 0
            },
            technical: {
                responseTime: `${responseTime}ms`,
                robotsTxt: await checkFile(`${domain}/robots.txt`),
                sitemapXml: await checkFile(`${domain}/sitemap.xml`)
            },
            images: {
                total: $('img').length,
                missingAlt: $('img:not([alt])').length
            },
            brokenLinks: []
        };

        // Broken Links Logic (Max 10 for performance)
        const links = [];
        $('a[href^="http"]').each((i, el) => { if (i < 10) links.push($(el).attr('href')); });
        const brokenResults = await Promise.all(links.map(async (link) => {
            return (await isLinkBroken(link)) ? link : null;
        }));
        results.brokenLinks = brokenResults.filter(l => l !== null);

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: "Site unreachable. Check your URL." });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));

