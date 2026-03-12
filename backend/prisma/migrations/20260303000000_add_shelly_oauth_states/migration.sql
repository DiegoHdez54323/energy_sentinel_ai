CREATE TABLE "shelly_oauth_states" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shelly_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shelly_oauth_states_state_key" ON "shelly_oauth_states"("state");
CREATE INDEX "shelly_oauth_states_user_id_idx" ON "shelly_oauth_states"("user_id");
CREATE INDEX "shelly_oauth_states_expires_at_idx" ON "shelly_oauth_states"("expires_at");

ALTER TABLE "shelly_oauth_states"
ADD CONSTRAINT "shelly_oauth_states_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
