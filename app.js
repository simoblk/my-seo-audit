const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));

async function checkFile(url) {
    try {
        const resp = await axios.get(url, { timeout: 3000 });
        return resp.status === 200;
    } catch { return false; }
}

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

// Logic bach n-7sbu keyword density
function getKeywordDensity(text) {
    const words = text.toLowerCase().match(/\b(\w{4,})\b/g); // Ghir l-kalimat li fihom +4 characters
    if (!words) return [];
    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 keywords
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
        const bodyText = $('body').text();

        const results = {
            onPage: {
                title: $('title').text() || "Missing",
                desc: $('meta[name="description"]').attr('content') || "Missing",
                h1Count: $('h1').length,
                viewport: $('meta[name="viewport"]').length > 0,
                canonical: $('link[rel="canonical"]').attr('href') || "Missing",
                language: $('html').attr('lang') || "Not Defined"
            },
            content: {
                wordCount: bodyText.split(/\s+/).length,
                topKeywords: getKeywordDensity(bodyText),
                schemaMarkup: $('script[type="application/ld+json"]').length > 0
            },
            technical: {
                responseTime: `${responseTime}ms`,
                robotsTxt: await checkFile(`${domain}/robots.txt`),
                sitemapXml: await checkFile(`${domain}/sitemap.xml`),
                h2Count: $('h2').length,
                h3Count: $('h3').length
            },
            social: {
                ogTitle: $('meta[property="og:title"]').length > 0,
                ogImg: $('meta[property="og:image"]').length > 0
            },
            images: {
                total: $('img').length,
                missingAlt: $('img:not([alt])').length
            },
            brokenLinks: []
        };

        const links = [];
        $('a[href^="http"]').each((i, el) => { if (i < 8) links.push($(el).attr('href')); });
        const brokenResults = await Promise.all(links.map(async (link) => {
            return (await isLinkBroken(link)) ? link : null;
        }));
        results.brokenLinks = brokenResults.filter(l => l !== null);

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: "Site unreachable." });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
