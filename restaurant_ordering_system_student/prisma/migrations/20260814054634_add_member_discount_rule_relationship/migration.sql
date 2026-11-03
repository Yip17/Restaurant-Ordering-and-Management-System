-- DropIndex
DROP INDEX "idx_discount_rule_product";

-- DropIndex
DROP INDEX "idx_discount_rule_type";

-- AlterTable
ALTER TABLE "discount_rule" ADD COLUMN     "created_by" INTEGER;

-- AddForeignKey
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "member"("member_id") ON DELETE SET NULL ON UPDATE NO ACTION;
