-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "automationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "firstMessageReceivedAt" TIMESTAMP(3),
    "automationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContact_phoneNumber_key" ON "WhatsAppContact"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppContact_automationCompleted_idx" ON "WhatsAppContact"("automationCompleted");
