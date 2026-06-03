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

function topmeatCategoryId(categoryUrl) {
  try {
    const u = new URL(categoryUrl);
    return u.searchParams.get('ca_id');
  } catch {
    return null;
  }
}

function parseTopmeatListHtml(html, source, category) {
  const $ = cheerio.load(html);
  const items = [];

  $('li.lists__item, li.js-load').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const itName = $(el).find('input[name^="it_name["]').first().val() || '';
    const itSub = $(el).find('input[name^="it_name_1["]').first().val() || '';
    const rawName = [itName, itSub].filter(Boolean).join(' ').trim()
      || text.split(/\d{1,3}(?:,\d{3})+원/)[0].trim();

    let price = 0;
    const unitMatch = text.match(/(\d{1,3}(?:,\d{3})+)원\s+[\d.]+\s*Kg/i);
    if (unitMatch) {
      price = parseInt(unitMatch[1].replace(/,/g, ''), 10);
    } else {
      const kgMatch = text.match(/(\d{1,3}(?:,\d{3})+)원\s*\(?\s*kg/i);
      if (kgMatch) price = parseInt(kgMatch[1].replace(/,/g, ''), 10);
    }

    const htmlBlock = $(el).html() || '';
    const idMatch = htmlBlock.match(/item\.php\?it_id=([^'\"&]+)/);
    const url = idMatch
      ? absUrl(source.url, `/shop/item.php?it_id=${idMatch[1]}`)
      : category.url;

    if (!rawName || !price || price < 1000) return;
    items.push({
      rawName,
      rawPrice: `${price.toLocaleString('ko-KR')}원/kg`,
      price,
      url,
      category: category.name,
    });
  });

  return items;
}

function discoverTopmeatSubCategories(html, parentCaId) {
  const ids = new Set();
  const parent = String(parentCaId || '');

  for (const match of html.matchAll(/goods_kind_form_submit\s*\(\s*['"](\d+)['"]\s*\)/g)) {
    ids.add(match[1]);
  }

  for (const match of html.matchAll(/list\.php\?ca_id=(\d+)/g)) {
    const id = match[1];
    if (parent && id.startsWith(parent) && id.length > parent.length) {
      ids.add(id);
    }
  }

  return [...ids];
}

async function fetchTopmeatPage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'text/html',
    },
    timeout: 20000,
  });
  return iconv.decode(Buffer.from(res.data), 'EUC-KR');
}

async function scrapeTopmeatCategory(source, category) {
  const caId = topmeatCategoryId(category.url);
  if (!caId) {
    console.warn(`[${source.name}] ca_id 없음: ${category.url}`);
    return [];
  }

  const listUrl = absUrl(source.url, `/shop/list.php?ca_id=${caId}`);
  const html = await fetchTopmeatPage(listUrl);
  const directItems = parseTopmeatListHtml(html, source, category);
  if (directItems.length > 0) return directItems;

  const subIds = discoverTopmeatSubCategories(html, caId);
  if (subIds.length === 0) {
    console.warn(`[${source.name}] ${category.name}: 상품·하위카테고리 없음`);
    return [];
  }

  const items = [];
  const seen = new Set();
  const maxSubs = source.topmeatMaxSubcategories || 30;

  for (const subId of subIds.slice(0, maxSubs)) {
    const subUrl = absUrl(source.url, `/shop/list.php?ca_id=${subId}`);
    try {
      const subHtml = await fetchTopmeatPage(subUrl);
      for (const item of parseTopmeatListHtml(subHtml, source, category)) {
        const key = item.url || `${item.rawName}:${item.price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    } catch (err) {
      console.warn(`[${source.name}] 하위카테고리 ${subId} 실패:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return items;
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
  if (source.id === 'topmeat' || source.scrapeMode === 'topmeat-list') {
    return scrapeTopmeatCategory(source, category);
  }
  return scrapeGenericCategory(source, category);
}

module.exports = {
  scrapeCategory,
  scrapeMeatclubCategory,
  scrapeTopmeatCategory,
  scrapeGenericCategory,
  meatclubCategoryCode,
  topmeatCategoryId,
  parseMeatclubHtml,
  parseTopmeatListHtml,
  discoverTopmeatSubCategories,
};
