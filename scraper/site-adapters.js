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

function meatfriendsCategoryId(categoryUrl) {
  try {
    const u = new URL(categoryUrl);
    return u.searchParams.get('catNo');
  } catch {
    return null;
  }
}

function parseMeatfriendsListHtml(html, source, category) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('ul.prdList > li').each((_, el) => {
    const block = $(el).html() || '';
    const onclick = block.match(/fnProductDetail\('(\d+)','([^']*)','(\d+)'/);
    let rawName = $(el).find('p.stit').first().text().trim();
    let price = 0;
    let prdNo = '';

    if (onclick) {
      prdNo = onclick[1];
      rawName = rawName || onclick[2];
      price = parseInt(onclick[3], 10);
    } else {
      const rawPrice = $(el).find('dd.prdPrice strong').first().text().trim();
      price = normalizePrice(rawPrice);
    }

    const url = prdNo
      ? absUrl(source.url, `/display/selectDisplayDetail.do?prdNo=${prdNo}`)
      : category.url;

    if (!rawName || !price || price < 500) return;
    const key = url || `${rawName}:${price}`;
    if (seen.has(key)) return;
    seen.add(key);
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

function meatfriendsMaxPage(html) {
  const pages = [...String(html).matchAll(/goPage\('(\d+)'\)/g)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : 1;
}

async function scrapeMeatfriendsCategory(source, category) {
  const catNo = meatfriendsCategoryId(category.url);
  if (!catNo) {
    console.warn(`[${source.name}] catNo 없음: ${category.url}`);
    return [];
  }

  const referer = absUrl(source.url, `/display/displayIndex.do?catNo=${catNo}`);
  const items = [];
  const seen = new Set();
  let maxPage = 1;

  for (let pIdx = 1; pIdx <= maxPage; pIdx += 1) {
    const params = new URLSearchParams({
      catNo,
      pIdx: String(pIdx),
      lnb: 'Y',
      mbrTypeGb: category.mbrTypeGb || '99',
    });

    const res = await axios.post(
      'https://www.meatfriends.co.kr/display/selectDisplayListPage.do',
      params.toString(),
      {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: referer,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html, */*',
        },
        timeout: 20000,
      },
    );

    if (pIdx === 1) maxPage = meatfriendsMaxPage(res.data);
    for (const item of parseMeatfriendsListHtml(res.data, source, category)) {
      const key = item.url || `${item.rawName}:${item.price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }

    if (pIdx < maxPage) await new Promise((r) => setTimeout(r, 350));
  }

  return items;
}

async function scrapeBondaeroCategory(source, category) {
  const token = process.env.BONDAERO_ACCESS_TOKEN;
  if (!token) {
    console.warn(`[${source.name}] BONDAERO_ACCESS_TOKEN 없음 — 수집 건너뜀`);
    return [];
  }

  const items = [];
  const seen = new Set();
  let page = 0;
  let hasNext = true;
  const maxPages = source.bondaeroMaxPages || 20;

  while (hasNext && page < maxPages) {
    const { data } = await axios.post(
      'https://api.bondaero.kr/products/hanwoo/list',
      {
        filter: category.bondaeroFilter ?? null,
        sort: category.sort ?? 'r',
        page,
        size: category.size ?? 40,
        sortOrder: category.sortOrder ?? 'ed',
        coldCondition: category.coldCondition ?? 'f',
      },
      {
        headers: {
          ...DEFAULT_HEADERS,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 20000,
      },
    );

    const body = data?.body ?? data;
    const content = body?.content ?? [];
    for (const p of content) {
      const code = p.businessCode || p.itemBusinessCode;
      const price = normalizePrice(String(p.unitPrice ?? p.sellPrice ?? p.price ?? ''));
      if (!p.name || !price || price < 1000) continue;
      const url = code ? absUrl(source.url, `/product/${code}`) : category.url;
      const key = url || `${p.name}:${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        rawName: p.name,
        rawPrice: String(p.unitPrice ?? p.sellPrice ?? p.price ?? price),
        price,
        url,
        category: category.name,
      });
    }

    hasNext = !!body?.hasNext;
    page = typeof body?.nextPage === 'number' ? body.nextPage : page + 1;
    if (hasNext) await new Promise((r) => setTimeout(r, 350));
  }

  return items;
}

let ekcmCategoryCache = null;

async function fetchEkcmCategories() {
  if (ekcmCategoryCache) return ekcmCategoryCache;
  const res = await axios.get(
    'https://gw.ekcm.co.kr/api/display/v1/displayCategory/getDispCtgList?shopInfwYn=Y',
    {
      headers: { ...DEFAULT_HEADERS, Accept: 'application/json' },
      timeout: 20000,
    },
  );
  ekcmCategoryCache = Array.isArray(res.data) ? res.data : (res.data?.payload || []);
  return ekcmCategoryCache;
}

function ekcmCategoryNo(category, allCategories) {
  if (category.ekcmParentNo) return category.ekcmParentNo;
  try {
    const u = new URL(category.url);
    return u.searchParams.get('leafCtgNo')
      || u.searchParams.get('dispCtgNo')
      || u.searchParams.get('curCtgNo');
  } catch {
    return null;
  }
}

function ekcmLeafCategories(parentNo, allCategories) {
  const parent = allCategories.find((c) => c.dispCtgNo === String(parentNo));
  if (!parent) return [];

  const parentPath = parent.path;
  const parentLeaf = parent.leafYn === 'Y';
  if (parentLeaf) return [parent];

  return allCategories.filter(
    (c) => c.leafYn === 'Y' && c.path && c.path.startsWith(`${parentPath},`),
  );
}

async function fetchEkcmGoodsPage(dispCtgNo, pageNo, pageSize = 30) {
  const body = {
    dispCtgNoList: String(dispCtgNo),
    brandNoList: [],
    lsprdGrdCdList: [],
    homeCdList: [],
    ppYmdList: [],
    strgMthdGbCdList: [],
    workMethTypCdList: [],
    deliProcTypCdList: [],
    recomBkindList: [],
    qualityList: [],
    insfatGrdList: [],
    mffldList: [],
    estNoList: [],
    sortTpCd: '',
    pageNo,
    pageSize,
    aplyPsbMediaCd: '02',
    curCtgNo: String(dispCtgNo),
    noDispCtgRegYn: 'N',
  };

  const res = await axios.post(
    'https://gw.ekcm.co.kr/api/goods/v1/goods/dispGoodsList',
    body,
    {
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://www.ekcm.co.kr',
        Referer: 'https://www.ekcm.co.kr/pd/product',
      },
      timeout: 20000,
    },
  );

  if (res.data?.code && res.data.code !== '0000') return [];
  return res.data?.payload || [];
}

async function scrapeEkcmLeafCategory(source, leaf, categoryLabel) {
  const pageSize = source.ekcmPageSize || 30;
  const items = [];
  const seen = new Set();
  let pageNo = 1;
  let totCnt = 0;

  while (pageNo === 1 || pageNo * pageSize < totCnt) {
    const payload = await fetchEkcmGoodsPage(leaf.dispCtgNo, pageNo, pageSize);
    if (!payload.length) break;

    if (pageNo === 1) totCnt = Number(payload[0]?.totCnt || payload.length);

    for (const p of payload) {
      const price = normalizePrice(String(p.realUcost ?? p.salePrc ?? ''));
      const rawName = p.goodsNm || p.artcNm || '';
      const url = p.goodsNo
        ? absUrl(source.url, `/pd/productDetail?goodsNo=${p.goodsNo}`)
        : categoryLabel;
      if (!rawName || !price || price < 1000) continue;
      const key = String(p.goodsNo || url);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        rawName,
        rawPrice: `${price.toLocaleString('ko-KR')}원/kg`,
        price,
        url,
        category: `${categoryLabel} · ${leaf.dispCtgNm}`,
      });
    }

    pageNo += 1;
    if (pageNo * pageSize < totCnt) await new Promise((r) => setTimeout(r, 250));
  }

  return items;
}

async function scrapeEkcmCategory(source, category) {
  const catNo = ekcmCategoryNo(category, []);
  if (!catNo) {
    console.warn(`[${source.name}] dispCtgNo 없음: ${category.url}`);
    return [];
  }

  const allCategories = await fetchEkcmCategories();
  const leaves = ekcmLeafCategories(catNo, allCategories);
  if (!leaves.length) {
    console.warn(`[${source.name}] ${category.name}: leaf 카테고리 없음`);
    return [];
  }

  const maxLeaves = category.ekcmMaxLeafCategories ?? source.ekcmMaxLeafCategories ?? 60;
  const items = [];
  const seen = new Set();

  for (const leaf of leaves.slice(0, maxLeaves)) {
    try {
      const leafItems = await scrapeEkcmLeafCategory(source, leaf, category.name);
      for (const item of leafItems) {
        const key = item.url || `${item.rawName}:${item.price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    } catch (err) {
      console.warn(`[${source.name}] ${leaf.dispCtgNm} 실패:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 300));
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
  if (source.id === 'meatfriends' || source.scrapeMode === 'meatfriends-display') {
    return scrapeMeatfriendsCategory(source, category);
  }
  if (source.id === 'bondaero' || source.scrapeMode === 'bondaero-hanwoo-api') {
    return scrapeBondaeroCategory(source, category);
  }
  if (source.id === 'ekcm' || source.scrapeMode === 'ekcm-disp-goods') {
    return scrapeEkcmCategory(source, category);
  }
  return scrapeGenericCategory(source, category);
}

module.exports = {
  scrapeCategory,
  scrapeMeatclubCategory,
  scrapeTopmeatCategory,
  scrapeMeatfriendsCategory,
  scrapeBondaeroCategory,
  scrapeEkcmCategory,
  scrapeGenericCategory,
  meatclubCategoryCode,
  topmeatCategoryId,
  meatfriendsCategoryId,
  parseMeatclubHtml,
  parseTopmeatListHtml,
  parseMeatfriendsListHtml,
  discoverTopmeatSubCategories,
};
