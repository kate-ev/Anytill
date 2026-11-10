-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "Merchant" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "nearAccount" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "perOrderCapCents" INTEGER NOT NULL DEFAULT 50000,
    "dailyCapCents" INTEGER NOT NULL DEFAULT 500000,
    "slippageBps" INTEGER NOT NULL DEFAULT 100,
    "quoteTtlMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "originAsset" TEXT,
    "originSymbol" TEXT,
    "originChain" TEXT,
    "refundTo" TEXT,
    "depositAddress" TEXT,
    "depositMemo" TEXT,
    "amountIn" TEXT,
    "amountInDisplay" TEXT,
    "minAmountIn" TEXT,
    "amountOutAtomic" TEXT,
    "quoteSignature" TEXT,
    "quoteJson" TEXT,
    "quoteSource" TEXT,
    "deadline" DATETIME,
    "timeEstimateSec" INTEGER,
    "lastStatusJson" TEXT,
    "verificationJson" TEXT,
    "settledAt" DATETIME,
    "depositSeenAt" DATETIME,
    "markedPaidAt" DATETIME,
    "refundJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Merchant" ("shop") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "paymentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Payment_shop_orderRef_idx" ON "Payment"("shop", "orderRef");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");
