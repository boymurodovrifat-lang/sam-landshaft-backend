import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { requireSeedCredentials } from '../src/auth/security-config';
const prisma = new PrismaClient();
async function main() {
  const { email, password } = requireSeedCredentials(process.env);
  await prisma.admin.update({
    where: { email },
    data: { password: await bcrypt.hash(password, 12) },
  });
  console.log(
    'Administrator password updated. Rotate JWT_SECRET to revoke existing sessions.',
  );
}
main()
  .catch(() => {
    console.error(
      'Password update failed. Check credentials and database connection.',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
