-- AlterTable
ALTER TABLE "call_logs" ADD COLUMN     "category" TEXT DEFAULT 'Genel Bilgi',
ADD COLUMN     "duration_seconds" INTEGER DEFAULT 0;

-- CreateIndex
CREATE INDEX "appointments_clinic_id_starts_at_idx" ON "appointments"("clinic_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_status_idx" ON "appointments"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "call_logs_clinic_id_created_at_idx" ON "call_logs"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "call_logs_clinic_id_category_idx" ON "call_logs"("clinic_id", "category");
