export function calcItemPrices(
  buyPrice: number,
  targetMargin: number,
  appliedCost: number,
  lossRate: number,
) {
  if (!buyPrice || buyPrice <= 0) {
    return { kgTargetPrice: 0, kgSalePrice: 0, geunTargetPrice: 0, geunSalePrice: 0 };
  }
  const kgTargetPrice = Math.round((buyPrice / (1 - targetMargin)) * (1 + lossRate));
  const kgSalePrice = Math.round((buyPrice / (1 - appliedCost)) * (1 + lossRate));
  return {
    kgTargetPrice,
    kgSalePrice,
    geunTargetPrice: Math.round(kgTargetPrice * 0.6),
    geunSalePrice: Math.round(kgSalePrice * 0.6),
  };
}
