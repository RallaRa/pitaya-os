const dict = require('./aliases/dictionary.json');

function extractOrigin(rawName) {
  for (const info of Object.values(dict.origins)) {
    if (info.keywords.some(kw => rawName.includes(kw))) {
      return { ko: info.ko, en: info.en };
    }
  }
  return { ko: '기타', en: 'ETC' };
}

function extractAnimalType(rawName) {
  for (const info of Object.values(dict.animalTypes)) {
    if (info.keywords.some(kw => rawName.includes(kw))) {
      return { ko: info.ko, en: info.en };
    }
  }
  return { ko: '기타', en: 'ETC' };
}

function extractGrade(rawName) {
  for (const [alias, standard] of Object.entries(dict.grades)) {
    if (rawName.includes(alias)) return standard;
  }
  return '';
}

function extractStorage(rawName) {
  for (const [type, keywords] of Object.entries(dict.storageTypes)) {
    if (keywords.some(kw => rawName.toLowerCase().includes(kw.toLowerCase()))) return type;
  }
  return '냉동';
}

function extractUnit(name) {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(kg|g|KG|G)/i);
  if (match) return `${match[1]}${match[2].toLowerCase()}`;
  if (/1[Kk]/.test(name)) return '1kg';
  if (/2[Kk]/.test(name)) return '2kg';
  return '';
}

function normalizePrice(priceStr) {
  if (!priceStr) return 0;
  return parseInt(String(priceStr).replace(/[^0-9]/g, ''), 10) || 0;
}

function buildGroupKey(animalType, origin, standardName, storageType) {
  return `${animalType.ko}_${origin.ko}_${standardName}_${storageType}`;
}

function normalizeItem(rawName, firestoreAliases = {}) {
  const merged = { ...dict.items, ...firestoreAliases };

  for (const [alias, info] of Object.entries(merged)) {
    if (rawName.includes(alias)) {
      const infoObj = typeof info === 'string'
        ? { standard: info, animalType: '기타' }
        : info;
      const origin = infoObj.origin
        ? { ko: infoObj.origin, en: dict.origins[infoObj.origin]?.en || infoObj.origin }
        : extractOrigin(rawName);
      const animalType = infoObj.animalType
        ? { ko: infoObj.animalType, en: dict.animalTypes[infoObj.animalType]?.en || infoObj.animalType }
        : extractAnimalType(rawName);
      const storageType = extractStorage(rawName);
      const standardName = infoObj.standard;
      return {
        standardName,
        animalType,
        origin,
        brand: infoObj.brand || '',
        grade: extractGrade(rawName),
        storageType,
        aliasMatched: true,
        groupKey: buildGroupKey(animalType, origin, standardName, storageType),
      };
    }
  }

  const animalType = extractAnimalType(rawName);
  const origin = extractOrigin(rawName);
  const storageType = extractStorage(rawName);
  const standardName = rawName;
  return {
    standardName,
    animalType,
    origin,
    brand: '',
    grade: extractGrade(rawName),
    storageType,
    aliasMatched: false,
    groupKey: buildGroupKey(animalType, origin, standardName, storageType),
  };
}

module.exports = {
  normalizeItem,
  normalizePrice,
  extractUnit,
  buildGroupKey,
};
