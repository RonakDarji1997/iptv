-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "allowedCategories" TEXT,
ADD COLUMN     "allowedChannels" TEXT,
ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "blockedCategories" TEXT,
ADD COLUMN     "blockedChannels" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;
