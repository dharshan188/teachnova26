-- Phase 9: internal sandbox bookkeeping on incidents (fault context for the
-- deterministic validation engine). Never rendered to AI agents.
ALTER TABLE "incidents" ADD COLUMN "metadata" JSONB;