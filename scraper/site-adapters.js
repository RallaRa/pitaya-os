const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { normalizePrice } = require('./normalizer');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

function absUrl(base, href) {
  if (!href) return base;
  if (href.startsWith('http')) return href;
  const root = base.replace(/\/$/, '');
  return `${root}${href.startsWith('/') ? '' : '/'}${href}`;
}

function meatclubCategoryCode(categoryUrl) {
  try {
    const u = new URL(categoryUrl);
    const category = u.searchParams.get('category');
    if (category) return category;
    const code = u.searchParams.get('code');
    if (code) return `c${code}`;
  } catch {
    /* ignore */
  }
  return null;
}

function parseMeatclubHtml(html, source, category) {
  const $ = cheerio.load(html);
  const items = [];

  $('.goods_list_style1, li.goods_list_style1').each((_, el) => {
    const rawName = $(el).find('.goods_name_area .name, .name').first().text().trim();
    const rawPrice = $(el).find('.goods_price_area .sale_price, .sale_price').first().text().trim();
    const href = $(el).find('a[href*="goods"]').first().attr('href') || '';
    const price = normalizePrice(rawPrice);
    if (!rawName || !price || price < 1000) return;
    items.push({
      rawName,
      rawPrice,
      price,
      url: absUrl(source.url, href),
      category: category.name,
    });
  });

  return items;
}

async function scrapeMeatclubCategory(source, category) {
  const categoryCode = meatclubCategoryCode(category.url);
  if (!categoryCode) {
    console.warn(`[${source.name}] 카테고리 코드 없음: ${category.url}`);
    return [];
  }

  const params = new URLSearchParams({
    page: '1',
    searchMode: 'catalog',
    category: categoryCode,
    per: '40',
    sorting: 'ranking',
    filter_display: 'lattice',
  });

  const res = await axios.get(`https://meatclub.kr/goods/search_list?${params}`, {
    headers: {
      ...DEFAULT_HEADERS,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: category.url,
      Accept: 'text/html, */*; q=0.01',
    },
    timeout: 20000,
  });

  return parseMeatclubHtml(res.data, source, category);
}

async function scrapeGenericCategory(source, category) {
  const isEucKr = source.encoding === 'euc-kr';
  const res = await axios.get(category.url, {
    responseType: isEucKr ? 'arraybuffer' : 'text',
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'text/html',
      Referer: source.url,
    },
    timeout: 20000,
  });

  const html = isEucKr
    ? iconv.decode(Buffer.from(res.data), 'EUC-KR')
    : res.data;

  const $ = cheerio.load(html);
  const sel = source.selectors || {};
  const items = [];

  $(sel.item || '.goods-item').each((_, el) => {
    const rawName = $(el).find(sel.name || '.name').first().text().trim();
    const rawPrice = $(el).find(sel.price || '.price').first().text().trim();
    const href = $(el).find('a').first().attr('href') || '';
    const price = normalizePrice(rawPrice);
    if (!rawName || !price || price < 1000) return;
    items.push({
      rawName,
      rawPrice,
      price,
      url: absUrl(source.url, href || category.url),
      category: category.name,
    });
  });

  return items;
}

async function scrapeCategory(source, category) {
  if (source.id === 'meatclub' || source.scrapeMode === 'meatclub-search') {
    return scrapeMeatclubCategory(source, category);
  }
  return scrapeGenericCategory(source, category);
}

module.exports = {
  scrapeCategory,
  scrapeMeatclubCategory,
  scrapeGenericCategory,
  meatclubCategoryCode,
  parseMeatclubHtml,
};
