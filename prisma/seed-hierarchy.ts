/**
 * Sam-Landshaft hierarchy seeder.
 *
 * Usage:
 *   API_URL=https://api.sam-landshaft.uz/api \
 *   ADMIN_EMAIL=admin@sam-landshaft.uz \
 *   ADMIN_PASSWORD=ChangeMe123! \
 *   npx ts-node prisma/seed-hierarchy.ts
 *
 * Creates 4 root categories and all subcategories from the docx spec.
 * Existing categories (fvc, soil-moisture, soil-salinity) are reassigned to
 * their matching parent via PATCH — data (colors, files) preserved.
 */

const API_URL = process.env.API_URL || 'https://api.sam-landshaft.uz/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sam-landshaft.uz';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

interface CategoryRow {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  description?: string;
  unit?: string;
  colorScheme?: string;
  minValue?: number;
  maxValue?: number;
}

type Sub = {
  slug: string;
  name: string;
  description: string;
};

const ROOTS: { slug: string; name: string; description: string; subs: Sub[] }[] = [
  {
    slug: 'vegetatsiya',
    name: 'Vegetatsiya holatini baholovchi indikatorlar',
    description: "O'simlik va ekinlar uchun asosiy indekslar",
    subs: [
      { slug: 'ndvi', name: 'NDVI', description: 'Normalized Difference Vegetation Index — vegetatsiya zichligi va yashillik darajasi' },
      { slug: 'evi', name: 'EVI', description: 'Enhanced Vegetation Index — NDVI ga nisbatan zich vegetatsiyada aniqroq' },
      { slug: 'savi', name: 'SAVI', description: "Soil Adjusted Vegetation Index — tuproq ta'siri yuqori hududlar uchun" },
      { slug: 'gndvi', name: 'GNDVI', description: "Green NDVI — xlorofill holatini ko'rsatadi" },
      { slug: 'msavi', name: 'MSAVI', description: 'Modified SAVI — siyrak vegetatsiyada yaxshi natija beradi' },
      { slug: 'lai', name: 'LAI', description: 'Leaf Area Index — barg maydoni indeksi' },
      { slug: 'fvc', name: "FVC (O'simlik qoplami)", description: 'Fractional Vegetation Cover — vegetatsiya qoplami indeksi' },
    ],
  },
  {
    slug: 'harorat-namlik',
    name: "Harorat va namlik ko'rsatkichlari",
    description: 'Agroklimat monitoring uchun indikatorlar',
    subs: [
      { slug: 'lst', name: 'LST', description: 'Land Surface Temperature — yer yuzasi harorati' },
      { slug: 'brightness-temperature', name: 'Brightness Temperature', description: 'Issiqlik radiatsiyasi' },
      { slug: 'tvdi', name: 'TVDI', description: "Temperature Vegetation Dryness Index — qurg'oqchilik darajasi" },
      { slug: 'cwsi', name: 'CWSI', description: 'Crop Water Stress Index — suv stressi' },
      { slug: 'et', name: 'ET', description: "Evapotranspiration — bug'lanish va transpiratsiya" },
      { slug: 'pet', name: 'PET', description: 'Potential Evapotranspiration' },
      { slug: 'soil-moisture', name: 'Tuproq namligi (SMI)', description: 'Soil Moisture Index — tuproq namligi' },
    ],
  },
  {
    slug: 'tuproq-holati',
    name: 'Tuproq holati va degradatsiya indikatorlari',
    description: "Tuproq sho'rlanishi, degradatsiyasi va boshqa ko'rsatkichlari",
    subs: [
      { slug: 'soil-salinity', name: "Tuproq sho'rlanishi (SI)", description: 'Salinity Index — tuproqdagi tuz miqdori' },
      { slug: 'ndsi', name: 'NDSI', description: 'Normalized Difference Salinity Index' },
      { slug: 'ssi', name: 'SSI', description: 'Soil Salinity Index' },
      { slug: 'bi', name: 'BI', description: 'Brightness Index' },
      { slug: 'albedo', name: 'Albedo', description: 'Yer yuzasi aks etish koeffitsienti' },
      { slug: 'bsi', name: 'BSI', description: 'Bare Soil Index — ochiq tuproq indeksi' },
      { slug: 'soil-organic-matter', name: 'Soil Organic Matter', description: 'Tuproq organik moddasi indeksi' },
      { slug: 'clay-index', name: 'Clay Index', description: 'Loy (clay) indeksi' },
      { slug: 'carbonate-index', name: 'Carbonate Index', description: 'Karbonat indeksi' },
      { slug: 'soil-nitrogen', name: 'Tuproq azot miqdori', description: 'Tuproqdagi azot konsentratsiyasi' },
    ],
  },
  {
    slug: 'landshaft',
    name: 'Landshaft va yer qoplamasi indikatorlari',
    description: 'Yer qoplamasi, suv obyektlari, qurilish va relief',
    subs: [
      { slug: 'ndwi', name: 'NDWI', description: 'Normalized Difference Water Index — suv obyektlari' },
      { slug: 'mndwi', name: 'MNDWI', description: 'Modified NDWI — suv yuzalari uchun yaxshiroq' },
      { slug: 'ndbi', name: 'NDBI', description: 'Built-up Index — qurilish hududlari' },
      { slug: 'lulc', name: 'LULC', description: 'Land Use / Land Cover — yer qoplamasi klassifikatsiyasi' },
      { slug: 'dsi', name: 'DSI', description: 'Desertification Sensitivity Index' },
      { slug: 'land-degradation', name: 'Land Degradation Index', description: 'Yer degradatsiyasi indeksi' },
      { slug: 'fragmentation', name: 'Fragmentation Index', description: 'Parchalanganlik indeksi' },
      { slug: 'slope', name: 'Slope', description: 'Qiyalik (DEM asosida)' },
      { slug: 'aspect', name: 'Aspect', description: 'Ekspozitsiya (DEM asosida)' },
      { slug: 'dem', name: 'DEM', description: 'Digital Elevation Model — relief xaritasi' },
    ],
  },
];

async function request<T>(path: string, opts: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

async function login(): Promise<string> {
  const data = await request<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return data.accessToken;
}

async function main() {
  console.log(`→ API: ${API_URL}`);
  const token = await login();
  console.log('→ Login OK');

  const existing = await request<CategoryRow[]>('/categories');
  const bySlug = new Map(existing.map((c) => [c.slug, c]));

  for (let i = 0; i < ROOTS.length; i++) {
    const root = ROOTS[i];
    const existingRoot = bySlug.get(root.slug);

    let rootId: number;
    if (existingRoot) {
      const updated = await request<CategoryRow>(`/categories/${existingRoot.id}`, {
        method: 'PATCH',
        token,
        body: {
          parentId: null,
          name: root.name,
          description: root.description,
          sortOrder: i,
        },
      });
      rootId = updated.id;
      console.log(`   ✓ Root [${i}] updated: ${root.name} (id=${rootId})`);
    } else {
      const created = await request<CategoryRow>('/categories', {
        method: 'POST',
        token,
        body: {
          parentId: null,
          slug: root.slug,
          name: root.name,
          description: root.description,
          sortOrder: i,
        },
      });
      rootId = created.id;
      console.log(`   + Root [${i}] created: ${root.name} (id=${rootId})`);
    }

    for (let j = 0; j < root.subs.length; j++) {
      const sub = root.subs[j];
      const existingSub = bySlug.get(sub.slug);

      if (existingSub) {
        await request<CategoryRow>(`/categories/${existingSub.id}`, {
          method: 'PATCH',
          token,
          body: {
            parentId: rootId,
            name: sub.name,
            description: sub.description,
            sortOrder: j,
          },
        });
        console.log(`       ↻ ${sub.name} (id=${existingSub.id}) → parent=${root.slug}`);
      } else {
        const created = await request<CategoryRow>('/categories', {
          method: 'POST',
          token,
          body: {
            parentId: rootId,
            slug: sub.slug,
            name: sub.name,
            description: sub.description,
            sortOrder: j,
          },
        });
        console.log(`       + ${sub.name} (id=${created.id})`);
      }
    }
  }

  console.log('\n✅ Done.');
}

main().catch((err) => {
  console.error('❌ Xatolik:', err.message);
  process.exit(1);
});
