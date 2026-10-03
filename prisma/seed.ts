import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { requireSeedCredentials } from '../src/auth/security-config';

const prisma = new PrismaClient();

async function main() {
  const { email: adminEmail, password: adminPassword } = requireSeedCredentials(process.env);

  const hashed = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashed,
      name: 'Super Admin',
      role: Role.SUPER_ADMIN,
    },
  });
  console.log(`Admin ready: ${admin.email}`);

  // Default 2 categories
  const categories = [
    {
      name: "Tuproq sho'rlanishi",
      slug: 'soil-salinity',
      description: "Tuproqdagi tuz miqdori (EC — Electrical Conductivity)",
      unit: 'dS/m',
      minValue: 0,
      maxValue: 16,
      colorScheme: JSON.stringify([
        { value: 0, color: '#2ecc71' },
        { value: 2, color: '#f1c40f' },
        { value: 4, color: '#e67e22' },
        { value: 8, color: '#e74c3c' },
        { value: 16, color: '#8e44ad' },
      ]),
    },
    {
      name: 'Tuproq namligi',
      slug: 'soil-moisture',
      description: 'Tuproqdagi suv miqdori (hajm foizi)',
      unit: '%',
      minValue: 0,
      maxValue: 100,
      colorScheme: JSON.stringify([
        { value: 0, color: '#ffffcc' },
        { value: 25, color: '#a1dab4' },
        { value: 50, color: '#41b6c4' },
        { value: 75, color: '#2c7fb8' },
        { value: 100, color: '#253494' },
      ]),
    },
  ];

  for (const data of categories) {
    const c = await prisma.category.upsert({
      where: { slug: data.slug },
      update: {},
      create: data,
    });
    console.log(`Category ready: ${c.name}`);
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
