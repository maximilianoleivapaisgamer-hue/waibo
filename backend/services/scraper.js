const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeURL(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WhaBot/1.0)'
      }
    });

    const $ = cheerio.load(response.data);

    $('script, style, nav, footer, header, .menu, .nav, .footer, .header, iframe, noscript').remove();

    const title = $('title').text().trim();
    const h1s = $('h1').map((_, el) => $(el).text().trim()).get().join(' | ');
    const paragraphs = $('p, li, td, h2, h3')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(text => text.length > 20)
      .slice(0, 60)
      .join('\n');

    const content = `TÍTULO: ${title}\n${h1s ? `SECCIONES: ${h1s}\n` : ''}CONTENIDO:\n${paragraphs}`;

    return content.substring(0, 8000);
  } catch (err) {
    console.error('Error haciendo scraping de URL:', err.message);
    throw new Error(`No se pudo acceder a ${url}: ${err.message}`);
  }
}

module.exports = { scrapeURL };
