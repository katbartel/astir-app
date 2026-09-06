-- AlterTable
ALTER TABLE "watchlist_companies"
ADD COLUMN "networking_connections" JSONB NOT NULL DEFAULT '[]'::jsonb;
