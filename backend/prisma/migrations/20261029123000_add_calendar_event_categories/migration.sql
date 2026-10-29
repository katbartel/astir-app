CREATE TABLE "calendar_event_categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "calendar_event_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "application_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_event_categories_user_id_calendar_event_id_key"
ON "calendar_event_categories"("user_id", "calendar_event_id");

CREATE INDEX "calendar_event_categories_application_id_idx"
ON "calendar_event_categories"("application_id");

ALTER TABLE "calendar_event_categories" ADD CONSTRAINT "calendar_event_categories_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_event_categories" ADD CONSTRAINT "calendar_event_categories_application_id_fkey"
FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
