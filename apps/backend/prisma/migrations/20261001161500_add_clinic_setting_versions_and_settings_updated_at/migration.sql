-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "settings_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "clinic_setting_versions" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_setting_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_setting_versions_clinic_id_idx" ON "clinic_setting_versions"("clinic_id");

-- AddForeignKey
ALTER TABLE "clinic_setting_versions" ADD CONSTRAINT "clinic_setting_versions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
