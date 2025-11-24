-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "firstFullSyncCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SyncJob" ADD COLUMN     "channelsCount" INTEGER NOT NULL DEFAULT 0;
