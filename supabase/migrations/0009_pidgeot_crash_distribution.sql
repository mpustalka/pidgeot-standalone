-- Apply to the existing Supabase GAME database, after migration 0008.
-- This is separate from Netlify Database, which stores prize fulfillment.
-- Patch only the known multiplier assignment in the deployed controller.
-- Preserve its signature, timing, locking, settlement, seed handling and grants.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_pattern text := $pattern$v_crash_multiplier\s*:=\s*\(100\s*\+\s*\(v_random_value\s*%\s*1000\)\)::numeric\s*/\s*100\s*;$pattern$;
  v_matches integer;
begin
  if to_regprocedure('public.pidgeot_advance_round()') is null then
    raise exception 'The existing pidgeot_advance_round() must be installed before migration 0009';
  end if;

  v_definition := pg_get_functiondef('public.pidgeot_advance_round()'::regprocedure);
  select count(*) into v_matches from regexp_matches(v_definition, v_pattern, 'g');
  if v_matches <> 1 then
    raise exception 'Expected exactly one original crash multiplier assignment; found %. No controller changes were made.', v_matches;
  end if;

  v_updated := regexp_replace(v_definition, v_pattern, $replacement$v_crash_multiplier :=
      case
        -- 7,000 of 10,000 buckets: 1.00x through 1.99x.
        when (v_random_value % 10000) < 7000
          then (100 + ((v_random_value % 10000) % 100))::numeric / 100
        -- Remaining 3,000 buckets: 2.00x through 10.99x.
        else (200 + ((v_random_value % 10000) % 900))::numeric / 100
      end;$replacement$);

  execute v_updated;
end;
$migration$;
