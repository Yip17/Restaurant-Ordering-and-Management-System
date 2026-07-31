// test-prisma.js — run with: node test-prisma.js
// Quick smoke-test: connects via the adapter and queries the DB.
const prisma = require('./src/config/prisma');

async function main() {
    try {
        const result = await prisma.$queryRaw`SELECT 1 AS ok`;
        console.log('Prisma connected successfully!', result);

    } catch (error) {
        console.error('Prisma connection failed:', error);

    } finally {
        await prisma.$disconnect();
    }
}

main();
