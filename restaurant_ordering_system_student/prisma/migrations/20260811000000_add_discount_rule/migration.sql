-- CreateTable
CREATE TABLE "discount_rule" (
    "rule_id" SERIAL NOT NULL,
    "discount_type" VARCHAR(30) NOT NULL,
    "threshold_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "product_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_rule_pkey" PRIMARY KEY ("rule_id")
);

-- CreateIndex
CREATE INDEX "idx_discount_rule_type" ON "discount_rule"("discount_type");

-- CreateIndex
CREATE INDEX "idx_discount_rule_product" ON "discount_rule"("product_id");

-- AddForeignKey
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("product_id") ON DELETE SET NULL ON UPDATE NO ACTION;
