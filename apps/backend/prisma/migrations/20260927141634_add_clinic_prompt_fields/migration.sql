-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "cancellation_policy_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "greeting_message" TEXT,
ADD COLUMN     "special_instructions" TEXT,
ADD COLUMN     "voice_id" TEXT;
