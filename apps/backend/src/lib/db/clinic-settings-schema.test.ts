import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Clinic Settings Schema & Migration', () => {
  const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');
  const migrationsDir = path.resolve(__dirname, '../../../prisma/migrations');

  it('contains settingsUpdatedAt and ClinicSettingVersion in schema.prisma', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    // settingsUpdatedAt must be explicitly managed, NOT marked with @updatedAt
    expect(schemaContent).toContain('settingsUpdatedAt       DateTime?     @map("settings_updated_at")');
    expect(schemaContent).not.toMatch(/settingsUpdatedAt\s+DateTime\??\s+@updatedAt/);

    // ClinicSettingVersion model must exist with required fields
    expect(schemaContent).toContain('model ClinicSettingVersion');
    expect(schemaContent).toContain('clinicId  String   @map("clinic_id")');
    expect(schemaContent).toContain('snapshot  Json');
    expect(schemaContent).toContain('changedBy String?  @map("changed_by")');
    expect(schemaContent).toContain('createdAt DateTime @default(now()) @map("created_at")');
    expect(schemaContent).toContain('@@map("clinic_setting_versions")');
  });

  it('has a valid migration SQL file for setting versions and settings_updated_at', () => {
    const migrationDirs = fs.readdirSync(migrationsDir).filter((d) =>
      d.includes('add_clinic_setting_versions_and_settings_updated_at'),
    );

    expect(migrationDirs.length).toBe(1);
    const sqlPath = path.join(migrationsDir, migrationDirs[0], 'migration.sql');
    expect(fs.existsSync(sqlPath)).toBe(true);

    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    expect(sqlContent).toContain('ALTER TABLE "clinics" ADD COLUMN     "settings_updated_at" TIMESTAMP(3);');
    expect(sqlContent).toContain('CREATE TABLE "clinic_setting_versions"');
    expect(sqlContent).toContain('"snapshot" JSONB NOT NULL');
    expect(sqlContent).toContain('"changed_by" TEXT');
    expect(sqlContent).toContain('CREATE INDEX "clinic_setting_versions_clinic_id_idx"');
    expect(sqlContent).toContain('REFERENCES "clinics"("id") ON DELETE CASCADE');
  });
});
