-- Fix: approvals.status was created as TEXT but the Prisma schema declares it
-- as the ApprovalStatus enum. Cast the column to the enum type.
-- (Copy-only addition: the original history never created this enum, so a fresh
--  deploy of the No-AI demo DB needed it before the cast below.)
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED');
ALTER TABLE "approvals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "approvals"
  ALTER COLUMN "status" TYPE "ApprovalStatus"
  USING ("status"::"ApprovalStatus");
ALTER TABLE "approvals" ALTER COLUMN "status" SET DEFAULT 'PENDING';
