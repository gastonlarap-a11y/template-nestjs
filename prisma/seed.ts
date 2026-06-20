import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';

/**
 * Idempotent database seed. Run with: `pnpm prisma:seed`.
 *
 * Creates a deterministic admin user so the RBAC-protected endpoints are
 * immediately testable after a fresh `prisma migrate`.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Did you create your .env file?');
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(connectionString),
});

async function main(): Promise<void> {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Template Admin',
      roles: JSON.stringify(['Admin']),
      isActive: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`✅ Seeded admin user: ${admin.email} (${admin.id})`);
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
