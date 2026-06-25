/**
 * PRISM PostgreSQL Seed Script
 *
 * Creates baseline data for local development:
 *  - 5 merchants (Amazon, Swiggy, Zomato, Flipkart, Uber)
 *  - 3 demo users
 *
 * Run: npm run seed --workspace=infrastructure/postgres
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding PRISM database...');

  // ---- Merchants ----
  const merchants = [
    { name: 'Amazon India', code: 'AMAZON_IN', category: 'E-COMMERCE', bank_code: 'HDFC' as const },
    { name: 'Swiggy', code: 'SWIGGY', category: 'FOOD_DELIVERY', bank_code: 'ICICI' as const },
    { name: 'Zomato', code: 'ZOMATO', category: 'FOOD_DELIVERY', bank_code: 'SBI' as const },
    { name: 'Flipkart', code: 'FLIPKART', category: 'E-COMMERCE', bank_code: 'AXIS' as const },
    { name: 'Uber India', code: 'UBER_IN', category: 'TRANSPORT', bank_code: 'YESBANK' as const },
  ];

  for (const m of merchants) {
    await prisma.merchant.upsert({
      where: { code: m.code },
      update: {},
      create: m,
    });
  }
  console.log(`  ✓ ${merchants.length} merchants seeded`);

  // ---- Demo Users ----
  const users = [
    { name: 'Raj Kumar', phone: '+919810001001', upi_id: 'raj@hdfc', email: 'raj@example.com' },
    { name: 'Priya Sharma', phone: '+919810001002', upi_id: 'priya@sbi', email: 'priya@example.com' },
    { name: 'Arjun Mehta', phone: '+919810001003', upi_id: 'arjun@icici', email: 'arjun@example.com' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      update: {},
      create: u,
    });
  }
  console.log(`  ✓ ${users.length} demo users seeded`);

  console.log('\n✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
