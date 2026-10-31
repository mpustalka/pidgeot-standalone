CREATE TABLE flight_prizes (
 id uuid PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '', image_url text,
 points_cost bigint NOT NULL CHECK(points_cost > 0), stock integer NOT NULL CHECK(stock >= 0),
 enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE flight_redemptions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, prize_id uuid NOT NULL REFERENCES flight_prizes(id),
 prize_title text NOT NULL, coins bigint NOT NULL CHECK(coins > 0),
 shipping jsonb NOT NULL, status text NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','pending','approved','shipped','fulfilled','rejected','failed')),
 message text NOT NULL DEFAULT '', tracking text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flight_redemptions_user ON flight_redemptions(user_id, created_at DESC);
CREATE INDEX flight_redemptions_status ON flight_redemptions(status, created_at DESC);
