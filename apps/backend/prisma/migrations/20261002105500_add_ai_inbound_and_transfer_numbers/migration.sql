-- AlterTable: Add ai_inbound_number and transfer_number to clinics
ALTER TABLE "clinics" ADD COLUMN "ai_inbound_number" TEXT,
ADD COLUMN "transfer_number" TEXT;

-- CreateIndex: Enforce unique constraint on ai_inbound_number
CREATE UNIQUE INDEX "clinics_ai_inbound_number_key" ON "clinics"("ai_inbound_number");

-- ==============================================================================
-- GERİ ALMA (ROLLBACK) NOTU VE SQL KOMUTLARI:
-- Bu migrasyon canlı veritabanına uygulandıktan sonra geri alınmak istenirse
-- aşağıdaki SQL komutları sırasıyla çalıştırılmalıdır:
--
-- DROP INDEX IF EXISTS "clinics_ai_inbound_number_key";
-- ALTER TABLE "clinics" DROP COLUMN IF EXISTS "ai_inbound_number";
-- ALTER TABLE "clinics" DROP COLUMN IF EXISTS "transfer_number";
-- ==============================================================================
