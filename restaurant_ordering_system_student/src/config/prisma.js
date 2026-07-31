const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const pool = require("./database");

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
  log: ["query", "error", "warn"],
});

module.exports = prisma;