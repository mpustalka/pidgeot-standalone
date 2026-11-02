# pidgeot-standalone
 
Crash game but with pidgeot plus free prizes!!!

### Game database update

Apply `supabase/migrations/0009_pidgeot_crash_distribution.sql` to the existing
Supabase game database after migration 0008. Netlify Database deploy migrations
manage prize fulfillment separately and do not apply Supabase migrations.

The update changes only the known multiplier assignment inside the installed
`public.pidgeot_advance_round()` function. It refuses to modify an unexpected
controller definition. Existing round timing, payouts, seed commitments, and
permissions are preserved. Already generated crash points are unchanged.

New outcomes use the first eight hexadecimal characters of `md5(server_seed)`
as an unsigned 32-bit integer, then take the remainder modulo 10,000. Buckets
0–6,999 produce `1 + (bucket % 100) / 100`; buckets 7,000–9,999 produce
`2 + (bucket % 900) / 100`. This targets a 70% probability below 2.00x and a
30% probability at or above 2.00x, with negligible modulo bias from the 32-bit
source. Individual rounds remain deterministic; 70% is a probability, not a
quota per group of rounds. Seed verification for new rounds must use this
mapping rather than the previous `1 + (random_value % 1000) / 100` formula.
