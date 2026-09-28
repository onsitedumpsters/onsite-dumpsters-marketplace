-- Add MaintenanceLog for fleet container service history (BUILD_SPEC §8)
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "servicedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaintenanceLog_containerId_servicedAt_idx" ON "MaintenanceLog"("containerId", "servicedAt");
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;
