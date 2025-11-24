/*
  Warnings:

  - You are about to drop the column `ageRating` on the `Movie` table. All the data in the column will be lost.
  - You are about to drop the column `backdrop` on the `Movie` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `Movie` table. All the data in the column will be lost.
  - You are about to drop the column `ageRating` on the `Series` table. All the data in the column will be lost.
  - You are about to drop the column `backdrop` on the `Series` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `Series` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Snapshot_providerId_idx";

-- AlterTable
ALTER TABLE "Movie" DROP COLUMN "ageRating",
DROP COLUMN "backdrop",
DROP COLUMN "rating",
ADD COLUMN     "actors" TEXT,
ADD COLUMN     "addedAt" TIMESTAMP(3),
ADD COLUMN     "censored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "director" TEXT,
ADD COLUMN     "genreId" TEXT,
ADD COLUMN     "genres" TEXT,
ADD COLUMN     "highQuality" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kinopoiskId" TEXT,
ADD COLUMN     "lastPlayed" TIMESTAMP(3),
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "ratingImdb" DOUBLE PRECISION,
ADD COLUMN     "ratingKinopoisk" DOUBLE PRECISION,
ALTER COLUMN "year" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Profile" ALTER COLUMN "providerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Series" DROP COLUMN "ageRating",
DROP COLUMN "backdrop",
DROP COLUMN "rating",
ADD COLUMN     "actors" TEXT,
ADD COLUMN     "addedAt" TIMESTAMP(3),
ADD COLUMN     "censored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cmd" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "director" TEXT,
ADD COLUMN     "episodeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "genreId" TEXT,
ADD COLUMN     "genres" TEXT,
ADD COLUMN     "highQuality" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kinopoiskId" TEXT,
ADD COLUMN     "lastPlayed" TIMESTAMP(3),
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "ratingImdb" DOUBLE PRECISION,
ADD COLUMN     "ratingKinopoisk" DOUBLE PRECISION,
ADD COLUMN     "yearEnd" TEXT,
ALTER COLUMN "year" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Snapshot" ADD COLUMN     "type" TEXT,
ALTER COLUMN "profileId" DROP NOT NULL,
ALTER COLUMN "version" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "moviesCount" INTEGER NOT NULL DEFAULT 0,
    "seriesCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncJob_providerId_idx" ON "SyncJob"("providerId");

-- CreateIndex
CREATE INDEX "SyncJob_status_idx" ON "SyncJob"("status");

-- CreateIndex
CREATE INDEX "Movie_name_idx" ON "Movie"("name");

-- CreateIndex
CREATE INDEX "Series_name_idx" ON "Series"("name");

-- CreateIndex
CREATE INDEX "Snapshot_providerId_type_idx" ON "Snapshot"("providerId", "type");

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
