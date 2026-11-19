export type LevelInfo = { level: number; title: string; minXp: number };

export const LEVELS: LevelInfo[] = [
  { level: 1, title: "Beginner", minXp: 0 },
  { level: 2, title: "Learner", minXp: 100 },
  { level: 3, title: "Apprentice", minXp: 250 },
  { level: 4, title: "Explorer", minXp: 500 },
  { level: 5, title: "Scholar", minXp: 850 },
  { level: 6, title: "Advanced Scholar", minXp: 1300 },
  { level: 7, title: "Expert", minXp: 1900 },
  { level: 8, title: "Master", minXp: 2700 },
  { level: 9, title: "Grandmaster", minXp: 3700 },
  { level: 10, title: "Legendary Scholar", minXp: 5000 },
];

export function getLevel(totalXp: number) {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXp) current = l;
  const next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  const span = next ? next.minXp - current.minXp : 0;
  const into = xp - current.minXp;
  return {
    level: current.level,
    title: current.title,
    next,
    xpIntoLevel: into,
    xpToNext: next ? next.minXp - xp : 0,
    progress: next ? Math.min(100, Math.round((into / span) * 100)) : 100,
    isMax: !next,
  };
}
