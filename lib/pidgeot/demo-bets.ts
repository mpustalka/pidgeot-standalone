// Cosmetic demo activity only. Never submit these rows to bet or wallet APIs.
const PILOTS = ["Jollytherancher", "EeveeSxx", "ImGlob55", "Brainzr", "PidgeotKillah", "Imatreecko", "MagnemiteCrutch", "MagicapCrusade", "JoshSlugma"];

type DemoRound = {
  id: string;
  status: "betting" | "flying" | "crashed" | "settled";
  betting_opens_at: string;
  crash_multiplier: number | null;
};

export function demoBetsForRound(round: DemoRound | null, multiplier: number, now: number) {
  if (!round) return [];
  let seed = 2166136261;
  for (const char of round.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const count = 5 + seed % 4;
  const elapsed = Math.max(0, now - Date.parse(round.betting_opens_at));
  const finished = round.status === "crashed" || round.status === "settled";
  return Array.from({ length: count }, (_, index) => {
    const value = Math.imul(seed ^ (index + 1), 16777619) >>> 0;
    const target = (115 + value % 490) / 100;
    const cashed = finished
      ? round.crash_multiplier !== null && target < Number(round.crash_multiplier)
      : round.status === "flying" && multiplier >= target;
    return {
      id: `demo:${round.id}:${index}`,
      username: PILOTS[(seed + index) % PILOTS.length],
      betAmount: 5 + (value % 10) * 5,
      isDemo: true as const,
      isOwn: false,
      ...(cashed ? { cashout: target } : {}),
      appearsAfter: index * 650 + value % 450,
    };
  }).filter(bet => round.status !== "betting" || elapsed >= bet.appearsAfter);
}
