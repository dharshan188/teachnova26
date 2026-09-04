-- Phase 8.5: Telegram alerting hardening.
-- Adds terminal incident summary + permanent dedupe states.
-- Using IF NOT EXISTS so a fresh (replay) database converges to the same
-- enum value sets as the existing dev database, which already carries the
-- Phase 8.5 values introduced by service code.

ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_DUPLICATE';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HIGH_RISK_APPROVAL_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPAIR_APPLIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPAIR_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROLLBACK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RECOVERY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FINAL_SUMMARY';