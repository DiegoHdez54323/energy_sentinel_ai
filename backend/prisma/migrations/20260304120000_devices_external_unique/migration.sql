DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "devices"
    GROUP BY "user_id", "external_device_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce devices_user_external_unique: duplicates exist for (user_id, external_device_id)';
  END IF;
END $$;

CREATE UNIQUE INDEX "devices_user_external_unique" ON "devices"("user_id", "external_device_id");

DROP INDEX IF EXISTS "devices_user_vendor_external_unique";
DROP INDEX IF EXISTS "devices_home_vendor_external_unique";
