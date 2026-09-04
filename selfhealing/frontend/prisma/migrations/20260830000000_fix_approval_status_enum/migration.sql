-- Fix: approvals.status was created as TEXT but the Prisma schema declares it
-- as the ApprovalStatus enum. Create the enum and cast the column.
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED');
ALTER TABLE "approvals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "approvals"
  ALTER COLUMN "status" TYPE "ApprovalStatus"
  USING ("status"::"ApprovalStatus");
ALTER TABLE "approvals" ALTER COLUMN "status" SET DEFAULT 'PENDING';
