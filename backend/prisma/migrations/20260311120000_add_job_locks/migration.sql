CREATE TABLE "job_locks" (
  "key" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "job_locks_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "job_locks_expires_at_idx" ON "job_locks"("expires_at");
