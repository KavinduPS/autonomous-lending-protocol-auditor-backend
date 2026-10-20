-- CreateTable
CREATE TABLE "credit_balances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_credits" INTEGER NOT NULL DEFAULT 0,
    "extra_credits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" UUID NOT NULL,
    "balance_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packs" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripe_price_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_credit_purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "stripe_checkout_session_id" TEXT NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "credits" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "extra_credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_balances_user_id_key" ON "credit_balances"("user_id");

-- CreateIndex
CREATE INDEX "credit_transactions_balance_id_idx" ON "credit_transactions"("balance_id");

-- CreateIndex
CREATE INDEX "credit_transactions_reference_id_idx" ON "credit_transactions"("reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_packs_code_key" ON "credit_packs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "credit_packs_stripe_price_id_key" ON "credit_packs"("stripe_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "extra_credit_purchases_stripe_checkout_session_id_key" ON "extra_credit_purchases"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "extra_credit_purchases_stripe_payment_intent_id_key" ON "extra_credit_purchases"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "extra_credit_purchases_user_id_idx" ON "extra_credit_purchases"("user_id");

-- CreateIndex
CREATE INDEX "extra_credit_purchases_pack_id_idx" ON "extra_credit_purchases"("pack_id");

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "credit_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_credit_purchases" ADD CONSTRAINT "extra_credit_purchases_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "credit_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
