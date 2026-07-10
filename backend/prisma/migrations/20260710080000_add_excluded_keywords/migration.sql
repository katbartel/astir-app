-- AlterTable
ALTER TABLE "watchlist_preferences" ADD COLUMN     "excluded_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
