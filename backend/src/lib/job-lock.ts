import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";

type JobLockOptions = {
  key: string;
  leaseMs: number;
};

export async function withJobLock<T>(
  options: JobLockOptions,
  work: () => Promise<T>,
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  if (options.leaseMs <= 0) {
    throw new Error("options.leaseMs must be positive");
  }

  const ownerId = randomUUID();
  const expiresAt = new Date(Date.now() + options.leaseMs);

  const acquiredRows = await prisma.$queryRaw<Array<{ ownerId: string }>>`
    INSERT INTO "job_locks" ("key", "owner_id", "expires_at")
    VALUES (${options.key}, ${ownerId}, ${expiresAt})
    ON CONFLICT ("key")
    DO UPDATE SET
      "owner_id" = EXCLUDED."owner_id",
      "expires_at" = EXCLUDED."expires_at",
      "updated_at" = now()
    WHERE "job_locks"."expires_at" <= now()
    RETURNING "owner_id" AS "ownerId"
  `;

  if (acquiredRows.at(0)?.ownerId !== ownerId) {
    return { acquired: false };
  }

  try {
    const result = await work();
    return { acquired: true, result };
  } finally {
    await prisma.jobLock.deleteMany({
      where: {
        key: options.key,
        ownerId,
      },
    });
  }
}
