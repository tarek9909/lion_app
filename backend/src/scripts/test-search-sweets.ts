import { catalogService } from '../modules/catalog/catalog.service.js';

async function main() {
  const q1 = await catalogService.searchProducts('sweets');
  console.log('Search "sweets":', q1.length, q1.map(p => p.productName));

  const q2 = await catalogService.searchProducts('sweet');
  console.log('Search "sweet":', q2.length, q2.map(p => p.productName));

  const q3 = await catalogService.searchProducts('7elou');
  console.log('Search "7elou":', q3.length, q3.map(p => p.productName));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
