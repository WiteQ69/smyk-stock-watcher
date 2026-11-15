export const API = 'https://api.smyk.com/pl/pl/api/portal/delivery-channels';

export function productSettings(env) {
  const products = typeof env.PRODUCTS === 'string' ? JSON.parse(env.PRODUCTS) : env.PRODUCTS;
  if (!products) return [settings(env)];
  if (!Array.isArray(products) || !products.length || products.length > 5) throw Error('Monitor obsługuje od 1 do 5 produktów.');
  const configs = products.map(p => settings({...env,PRODUCT_SKU:p.sku,PRODUCT_NAME:p.name,PRODUCT_URL:p.url}));
  if (new Set(configs.map(c=>c.sku)).size !== configs.length) throw Error('Produkty muszą mieć różne numery SKU.');
  return configs;
}

export function settings(env) {
  const radius = Number(env.RADIUS_KM ?? 50);
  const postal = String(env.POSTAL_CODE ?? '').trim();
  const sku = String(env.PRODUCT_SKU ?? '').trim();
  if (!/^\d{2}-\d{3}$/.test(postal)) throw Error('Niepoprawny kod pocztowy.');
  if (!/^\d+$/.test(sku)) throw Error('Niepoprawny numer produktu.');
  if (!Number.isFinite(radius) || radius < 1 || radius > 1000) throw Error('Promień musi wynosić 1–1000 km.');
  const productUrl = new URL(env.PRODUCT_URL);
  if (productUrl.origin !== 'https://www.smyk.com') throw Error('Niepoprawny adres produktu.');
  return {postal, sku, radius, name: env.PRODUCT_NAME || `Produkt SMYK ${sku}`, url: productUrl.href, key: `${postal}:${sku}:${radius}`};
}

export async function requestJSON(url, init = {}, fetcher = fetch) {
  const response = await fetcher(url, {...init, signal: AbortSignal.timeout(15000), headers: {Accept: 'application/json', ...init.headers}});
  if (!response.ok) throw Error(`Usługa ${new URL(url).hostname} zwróciła HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('Usługa nie zwróciła JSON; możliwa blokada lub zmiana API.');
  return response.json();
}

export async function resolveLocation(postal, fetcher = fetch) {
  const url = new URL(`${API}/location`);
  url.searchParams.set('searchString', postal);
  const result = await requestJSON(url, {}, fetcher);
  const latitude = Number(result.geoLatitude), longitude = Number(result.geoLongitude);
  if (result.geoLatitude == null || result.geoLatitude === '' || result.geoLongitude == null || result.geoLongitude === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw Error('SMYK nie rozpoznał kodu pocztowego.');
  return {latitude, longitude};
}

export function parseStore(row) {
  const store = row?.store;
  const quantity = Number(row?.numberOfArticlesAvailable);
  const price = Number(row?.salePrice);
  const distanceText = String(store?.distanceToRequestedLocalization ?? '').trim();
  const distanceMatch = distanceText.match(/^(\d+(?:[.,]\d+)?)\s*km$/i);
  if (!store?.code || !store?.name || row.numberOfArticlesAvailable == null || row.salePrice == null || !Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0 || !distanceMatch) throw Error('Zmienił się format danych sklepu; poprzedni stan został zachowany.');
  return {id: String(store.code), name: store.name, city: store.city || '', address: [store.street, store.streetNumber].filter(Boolean).join(' '), distanceKm: Number(distanceMatch[1].replace(',', '.')), quantity, priceCents: Math.round(price * 100)};
}

export async function fetchStores(config, location, fetcher = fetch) {
  const stores = new Map();
  let processed = 0;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${API}/stores/inventory`);
    url.search = new URLSearchParams({page: String(page), pageSize: '100', latitude: String(location.latitude), longitude: String(location.longitude), sku: config.sku});
    const result = await requestJSON(url, {}, fetcher);
    const total = Number(result.paging?.totalElements);
    if (!Array.isArray(result.content) || result.paging?.totalElements == null || !Number.isInteger(total) || total < 0) throw Error('Niepełna odpowiedź API SMYK; poprzedni stan został zachowany.');
    for (const row of result.content) {
      const store = parseStore(row);
      if (store.quantity > 0 && store.distanceKm <= config.radius) stores.set(store.id, store);
    }
    processed += result.content.length;
    if (processed >= total) return [...stores.values()].sort((a, b) => a.distanceKm - b.distanceKm);
    if (!result.content.length) throw Error('Przerwana lista sklepów; poprzedni stan został zachowany.');
  }
  throw Error('Lista przekroczyła limit stron; poprzedni stan został zachowany.');
}

