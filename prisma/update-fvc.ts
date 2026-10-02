import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fvcUpdate = {
    description: 'Fractional Vegetation Cover — o\'simlik qoplami indeksi (-1 dan 1 gacha)',
    unit: '',
    minValue: -1,
    maxValue: 1,
    colorScheme: JSON.stringify([
      { value: -1, color: '#8c510a' },
      { value: -0.5, color: '#d8b365' },
      { value: 0, color: '#f6e8c3' },
      { value: 0.3, color: '#c7e9c0' },
      { value: 0.6, color: '#41ab5d' },
      { value: 1, color: '#00441b' },
    ]),
  };

  const matches = await prisma.category.findMany({
    where: {
      OR: [
        { slug: { contains: 'fvc', mode: 'insensitive' } },
        { name: { contains: 'FVC', mode: 'insensitive' } },
      ],
    },
  });

  if (matches.length === 0) {
    console.log('No FVC category found. Nothing to update.');
    return;
  }

  for (const cat of matches) {
    const updated = await prisma.category.update({
      where: { id: cat.id },
      data: fvcUpdate,
    });
    console.log(
      `Updated: ${updated.name} (slug=${updated.slug}) → range ${updated.minValue}..${updated.maxValue}, unit="${updated.unit}"`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
