require('dotenv').config();
const { getDb } = require('./firestore-upload');

const SOURCES = [
  {
    id: 'meatclub',
    name: '미트클럽',
    url: 'https://meatclub.kr',
    enabled: true,
    encoding: 'utf-8',
    categories: [
      { url: 'https://meatclub.kr/goods/catalog?code=000300030001', name: '돼지 삼겹살' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300030003', name: '돼지 목살' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300030005', name: '돼지 앞다리살' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300030007', name: '돼지 뒷다리살' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300030012', name: '돼지 항정살' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300030013', name: '돼지 가브리살' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300030014', name: '돼지 갈매기살' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300020001', name: '돼지 삼겹살 냉장' },
      { url: 'https://meatclub.kr/goods/catalog?code=000300020003', name: '돼지 목살 냉장' },
      { url: 'https://meatclub.kr/goods/catalog?code=0005', name: '수입육' },
    ],
    selectors: {
      item: '.goods-item, .item_goods, li[class*="goods"]',
      name: '.goods-name, .name, [class*="name"]',
      price: '.goods-price, .price, [class*="price"]',
    },
  },
  {
    id: 'topmeat',
    name: '탑미트',
    url: 'https://topmeat.co.kr',
    enabled: true,
    encoding: 'euc-kr',
    categories: [
      { url: 'https://topmeat.co.kr/shop/list.php?ca_id=10', name: '한우' },
      { url: 'https://topmeat.co.kr/shop/list.php?ca_id=20', name: '한우 냉장' },
      { url: 'https://topmeat.co.kr/shop/list.php?ca_id=30', name: '육우' },
      { url: 'https://topmeat.co.kr/shop/list.php?ca_id=40', name: '수입육' },
      { url: 'https://topmeat.co.kr/shop/list.php?ca_id=50', name: '한돈' },
    ],
    selectors: {
      item: '.item_list li, .goods-item',
      name: '.goods_name, .it_name, .name',
      price: '.goods_price, .it_price, .price',
    },
  },
  {
    id: 'meatfriends',
    name: '미트프렌즈',
    url: 'https://www.meatfriends.co.kr',
    enabled: true,
    encoding: 'utf-8',
    categories: [
      { url: 'https://www.meatfriends.co.kr/display/selectDisplayDetail.do?dispNo=27', name: '한돈' },
      { url: 'https://www.meatfriends.co.kr/display/selectDisplayDetail.do?dispNo=28', name: '수입육' },
    ],
    selectors: {
      item: '[class*="product-item"], [class*="goods-item"]',
      name: '[class*="product-name"], [class*="name"]',
      price: '[class*="price"]',
    },
  },
  {
    id: 'bondaero',
    name: '본대로',
    url: 'https://www.bondaero.kr',
    enabled: true,
    encoding: 'utf-8',
    categories: [
      { url: 'https://www.bondaero.kr/products', name: '한우' },
    ],
    selectors: {
      item: '[class*="product"], [class*="item"], [class*="card"]',
      name: '[class*="name"], [class*="title"]',
      price: '[class*="price"]',
    },
  },
  {
    id: 'ekcm',
    name: '금천미트',
    url: 'https://www.ekcm.co.kr',
    enabled: true,
    encoding: 'utf-8',
    categories: [
      { url: 'https://www.ekcm.co.kr/goods/list', name: '전체' },
    ],
    selectors: {
      item: '.goods-item, .item, [class*="goods"]',
      name: '[class*="name"]',
      price: '[class*="price"]',
    },
  },
];

async function init() {
  const db = getDb();
  for (const source of SOURCES) {
    const { id, ...data } = source;
    await db.collection('scraper_sources').doc(id).set(data, { merge: true });
    console.log(`✅ ${source.name} 등록`);
  }
  console.log('초기화 완료');
}

init().catch(console.error);
