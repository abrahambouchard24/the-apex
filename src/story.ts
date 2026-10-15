// Story mode, "Rookie Season": the characters, the missions (built from the normal race rules
// with different goals and set-ups), the garage upgrades, and the player's saved progress.
// Pure data and logic: the screens live in storyui.ts and the racing in main.ts.

import { Mods, NO_MODS } from './craft';

// --- characters ---------------------------------------------------------------------------------

export type Speaker = 'player' | 'lupis' | 'charlie' | 'sophi' | 'judah' | 'rook' | 'announcer';

export interface Character { name: string; role: string; color: string }

/** Who's who. The player's name is filled in from the save. */
export const CHARACTERS: Record<Speaker, Character> = {
  player:    { name: 'YOU', role: 'Rookie, Leopard GP', color: '#ff3d6e' },
  charlie:   { name: 'CHARLIE', role: 'County speedway legend', color: '#ff8a1f' },
  lupis:     { name: 'MR. LUPIS', role: 'Team Secretary, Leopard GP', color: '#ffd23f' },
  sophi:     { name: 'SOPHI', role: 'Team Mechanic, Leopard GP', color: '#4fe3ff' },
  judah:     { name: 'JUDAH', role: 'Two-time champion, Vanta Racing', color: '#a46bff' },
  rook:      { name: 'ROOK', role: 'Judah\'s teammate, Vanta Racing', color: '#3d7bff' },
  announcer: { name: 'ANNOUNCER', role: 'Apex Series broadcast', color: '#8a93c0' },
};

export interface Line { who: Speaker; text: string }

// --- the field ----------------------------------------------------------------------------------

/**
 * Livery index per car in the race (see LIVERIES in main.ts): 0 red (the player, Leopard GP),
 * 1 cyan, 2 green, 3 orange, 4 purple, 5 blue.
 */
export interface Entrant {
  name: string;
  livery: number;
  /** Driving skill, 0.7 (cautious) to 1 (at the limit). */
  skill: number;
  /** Extra pace on top of the mission's AI buff (Judah's edge). */
  edge?: number;
  /** A story character this car belongs to, so goals can name it. */
  who?: Speaker;
}

const CHARLIE = (skill: number): Entrant => ({ name: 'CHARLIE', livery: 3, skill, who: 'charlie' });
const JUDAH = (skill: number, edge: number): Entrant => ({ name: 'JUDAH', livery: 4, skill, edge, who: 'judah' });
const ROOK = (skill: number): Entrant => ({ name: 'ROOK', livery: 5, skill, who: 'rook' });
/** Local racers and other teams' drivers, to fill out a grid. */
const LOCALS: Entrant[] = [
  { name: 'MAGS', livery: 2, skill: 0.8 },
  { name: 'DUTCH', livery: 1, skill: 0.8 },
  { name: 'KENJI', livery: 5, skill: 0.8 },
  { name: 'BEA', livery: 3, skill: 0.8 },
  { name: 'VOSS', livery: 4, skill: 0.8 },
];
/** n filler drivers whose skills spread across [lo, hi], skipping liveries already used. */
function fillers(n: number, lo: number, hi: number, taken: number[]): Entrant[] {
  const out: Entrant[] = [];
  for (const e of LOCALS) {
    if (out.length === n) break;
    if (taken.includes(e.livery)) continue;
    taken.push(e.livery);
    out.push({ ...e, skill: n === 1 ? hi : lo + ((hi - lo) * out.length) / (n - 1) });
  }
  return out;
}

// --- missions -----------------------------------------------------------------------------------

export type Goal =
  | { kind: 'win' }
  | { kind: 'top'; n: number }
  | { kind: 'beat'; who: Speaker }
  | { kind: 'lap'; seconds: number }
  | { kind: 'cool' }               // finish without ever overheating
  | { kind: 'and'; goals: Goal[] };

export interface Mission {
  id: string;
  chapter: number;
  title: string;
  track: string;
  laps: number;
  rivals: Entrant[];
  /** Where the player starts: from the back, from pole, or a random slot. */
  grid: 'back' | 'pole' | 'random';
  /** Pace bump for every AI car (fraction), the main way difficulty climbs through the story. */
  aiBuff: number;
  /** Heat the player's car starts with (the sabotage mission). */
  startHeat?: number;
  goal: Goal;
  bonus?: Goal;
  points: number;
  bonusPoints: number;
  /** A note on the result card the first time this mission is completed. */
  unlocks?: string;
  intro: Line[];
  win: Line[];
  lose: Line[];
}

export const CHAPTERS = ['COUNTY CUP', 'LEOPARD GP', 'THE CLIMB', 'THE APEX'];
/** One line under each chapter's title card. */
export const CHAPTER_TAGLINES = [
  'A Tuesday night. A county speedway. One borrowed seat.',
  'A team on its last legs, and a champion who wants you gone.',
  'Every race a little faster. Every rival a little meaner.',
  'One title. One rival. Everything on the line.',
];

export const MISSIONS: Mission[] = [
  // ---- Chapter 1: County Cup ------------------------------------------------------------------
  {
    id: 'prove-it', chapter: 0, title: 'PROVE IT', track: 'VELOCITY RING', laps: 2, grid: 'random', aiBuff: 0,
    rivals: [CHARLIE(0.74)],
    goal: { kind: 'win' }, points: 150, bonusPoints: 0,
    intro: [
      { who: 'announcer', text: 'Tuesday night at the county speedway. Two cars on the grid, and twelve people in the stands.' },
      { who: 'charlie', text: 'So you\'re the kid who\'s been sleeping in my pit garage. {name}, right?' },
      { who: 'player', text: 'I can drive. I just need a car.' },
      { who: 'charlie', text: 'Everybody can drive on a Tuesday. I\'ve sponsored a seat in the County Cup for twenty-two years. It goes to whoever beats me.' },
      { who: 'charlie', text: 'Two laps. Nobody\'s passed me on this banking since before you were born.' },
    ],
    win: [
      { who: 'charlie', text: '...Well. Huh.' },
      { who: 'charlie', text: 'Twenty-two years. Fine. The seat\'s yours, {name}. Don\'t make me regret it.' },
    ],
    lose: [
      { who: 'charlie', text: 'Told you. The banking\'s mine. Come back when you\'ve learned to brake.' },
    ],
  },
  {
    id: 'county-cup', chapter: 0, title: 'COUNTY CUP', track: 'VELOCITY RING', laps: 3, grid: 'back', aiBuff: 0,
    rivals: fillers(5, 0.72, 0.84, [0]),
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'win' }, points: 200, bonusPoints: 100,
    intro: [
      { who: 'charlie', text: 'Six cars, three laps, and you start dead last. That\'s what a new name gets you.' },
      { who: 'charlie', text: 'Get on the podium and people start paying attention. Win it and they won\'t forget you.' },
    ],
    win: [
      { who: 'announcer', text: 'A rookie on the County Cup podium! Somebody find out who that red car belongs to!' },
      { who: 'lupis', text: 'Excuse me. Lupis. Team Secretary, Leopard GP. Perhaps you\'ve heard of us.' },
      { who: 'charlie', text: 'Leopard GP. Now there\'s a name I haven\'t heard in a while.' },
      { who: 'lupis', text: 'We have a seat open in the Apex Series. A tryout, tomorrow, at the Grand Prix circuit. Bring Charlie if you like.' },
    ],
    lose: [
      { who: 'charlie', text: 'Off the podium. It happens. Shake it off and line up again.' },
    ],
  },
  {
    id: 'tryout', chapter: 0, title: 'THE TRYOUT', track: 'APEX GRAND PRIX', laps: 3, grid: 'pole', aiBuff: 0,
    rivals: [],
    goal: { kind: 'lap', seconds: 27.5 }, bonus: { kind: 'lap', seconds: 25.5 }, points: 250, bonusPoints: 100,
    unlocks: 'GARAGE UNLOCKED: spend team points on upgrades from the story menu.',
    intro: [
      { who: 'lupis', text: 'An empty track, three laps. Leopard GP needs one lap under twenty-seven and a half seconds.' },
      { who: 'lupis', text: 'Our previous driver managed twenty-five and a half. He has since... moved on.' },
      { who: 'charlie', text: 'Brake before the corners, kid. Not in them.' },
    ],
    win: [
      { who: 'lupis', text: 'Acceptable. More than acceptable, frankly. Welcome to Leopard GP, {name}.' },
      { who: 'sophi', text: 'So you\'re the one who\'s going to wreck my car. I\'m Sophi. I keep it alive.' },
      { who: 'sophi', text: 'Every race you finish earns the team points. Spend them in the garage and I\'ll make the car faster. A little at a time.' },
    ],
    lose: [
      { who: 'lupis', text: 'Not quite. The track is booked until six. Try again.' },
    ],
  },

  // ---- Chapter 2: Leopard GP ------------------------------------------------------------------
  {
    id: 'shakedown', chapter: 1, title: 'SHAKEDOWN', track: 'HARBOR LIGHTS', laps: 3, grid: 'random', aiBuff: 0.01,
    rivals: fillers(3, 0.8, 0.88, [0]),
    goal: { kind: 'and', goals: [{ kind: 'top', n: 3 }, { kind: 'cool' }] }, bonus: { kind: 'win' }, points: 250, bonusPoints: 100,
    intro: [
      { who: 'sophi', text: 'First proper race in the Apex Series. Harbor Lights. Four cars.' },
      { who: 'sophi', text: 'I rebuilt the cooling last night and I want to know it works. Top three, and do NOT overheat my car.' },
      { who: 'sophi', text: 'If it gets hot, there\'s a cooling lane on the outside of the main straight. Use it.' },
    ],
    win: [
      { who: 'sophi', text: 'Temperatures held. Car\'s in one piece. I might actually like you.' },
    ],
    lose: [
      { who: 'sophi', text: 'That\'s not a shakedown, that\'s a meltdown. Again. Gently this time.' },
    ],
  },
  {
    id: 'enter-judah', chapter: 1, title: 'ENTER JUDAH', track: 'NEON STREETS', laps: 3, grid: 'random', aiBuff: 0.015,
    rivals: [JUDAH(0.95, 0.05), ROOK(0.88), ...fillers(3, 0.8, 0.88, [0, 4, 5])],
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'judah' }, points: 300, bonusPoints: 150,
    intro: [
      { who: 'judah', text: 'Leopard GP? I thought they folded. What are they running now, a rental?' },
      { who: 'judah', text: 'Stay out of my mirrors, rookie. It\'s a long way down from the Apex.' },
      { who: 'lupis', text: 'Judah. Vanta Racing. Two championships. And a car that is faster than it has any right to be.' },
      { who: 'sophi', text: 'You won\'t outrun him on the straights. Not yet. Get on the podium and let him have his parade.' },
    ],
    win: [
      { who: 'judah', text: 'Third place in a rental. Cute.' },
      { who: 'sophi', text: 'His car pulled away like we were standing still. Nobody gets that kind of pace legally.' },
      { who: 'lupis', text: 'Rumors are not evidence, Sophi. Points are. Keep scoring them.' },
    ],
    lose: [
      { who: 'judah', text: 'Told you. Long way down.' },
    ],
  },
  {
    id: 'penalty', chapter: 1, title: 'BACK OF THE GRID', track: 'CRYSTAL CANYON', laps: 3, grid: 'back', aiBuff: 0.02,
    rivals: [ROOK(0.9), ...fillers(4, 0.82, 0.9, [0, 5])],
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'rook' }, points: 300, bonusPoints: 150,
    intro: [
      { who: 'lupis', text: 'Vanta filed a protest about our "unsafe driving" in the streets. The stewards agreed with them.' },
      { who: 'lupis', text: 'You start from the back. Judah, of course, sits this one out to "rest".' },
      { who: 'sophi', text: 'Crystal Canyon is all switchbacks. Drift the long corners: it charges the boost. Then spend it on the way out.' },
    ],
    win: [
      { who: 'sophi', text: 'Last to the podium. On the canyon. Rook\'s going to hear about that from Judah.' },
      { who: 'rook', text: '...Fine driving, Leopard. Don\'t tell him I said that.' },
    ],
    lose: [
      { who: 'lupis', text: 'The stewards will be pleased. I am not. Again, please.' },
    ],
  },

  // ---- Chapter 3: The Climb -------------------------------------------------------------------
  {
    id: 'last-ride', chapter: 2, title: 'CHARLIE\'S LAST RIDE', track: 'SUMMIT PASS', laps: 3, grid: 'random', aiBuff: 0.025,
    rivals: [CHARLIE(0.93), ...fillers(4, 0.84, 0.92, [0, 3])],
    goal: { kind: 'beat', who: 'charlie' }, bonus: { kind: 'win' }, points: 350, bonusPoints: 150,
    intro: [
      { who: 'charlie', text: 'Leopard GP let me have one more go. Summit Pass. My favorite road in the world.' },
      { who: 'charlie', text: 'I\'m not here to make friends, {name}. I want to see what they\'ve taught you. Don\'t you dare lift for me.' },
    ],
    win: [
      { who: 'charlie', text: 'Ha! There it is. You\'re better than I ever was. Don\'t let it go to your head.' },
      { who: 'charlie', text: 'Now go beat that smug Vanta kid for me.' },
    ],
    lose: [
      { who: 'charlie', text: 'Twenty-two years, kid. The mountain still likes me better. Again.' },
    ],
  },
  {
    id: 'mirage', chapter: 2, title: 'MIRAGE', track: 'DESERT MIRAGE', laps: 3, grid: 'random', aiBuff: 0.025,
    rivals: [ROOK(0.95), JUDAH(0.96, 0.05), ...fillers(3, 0.86, 0.93, [0, 4, 5])],
    goal: { kind: 'beat', who: 'rook' }, bonus: { kind: 'beat', who: 'judah' }, points: 350, bonusPoints: 200,
    intro: [
      { who: 'judah', text: 'Rook. Keep the rookie behind you. That\'s your whole job today.' },
      { who: 'sophi', text: 'Long straights, huge braking zones. DRS opens if you\'re within a second of the car ahead. Use Rook\'s tow.' },
    ],
    win: [
      { who: 'rook', text: 'He\'s going to bench me for that.' },
      { who: 'judah', text: 'Enjoy it, rookie. Wins against Rook don\'t count.' },
    ],
    lose: [
      { who: 'judah', text: 'See? Rook earns his money.' },
    ],
  },
  {
    id: 'sabotage', chapter: 2, title: 'SABOTAGE', track: 'SKYLINE CAROUSEL', laps: 3, grid: 'random', aiBuff: 0.03,
    rivals: [JUDAH(0.97, 0.05), ROOK(0.95), ...fillers(3, 0.88, 0.95, [0, 4, 5])],
    startHeat: 0.65,
    goal: { kind: 'top', n: 3 }, bonus: { kind: 'beat', who: 'judah' }, points: 400, bonusPoints: 200,
    intro: [
      { who: 'sophi', text: 'Someone was in our garage last night. The coolant line\'s been cut. Clean cut.' },
      { who: 'sophi', text: 'No time to fix it. You\'re starting hot. Very hot. Get to the cooling lane on the straight and stay off the walls.' },
      { who: 'lupis', text: 'Vanta\'s garage is next to ours. I\'m sure that\'s a coincidence.' },
    ],
    win: [
      { who: 'sophi', text: 'You podiumed with a cut coolant line. I\'m framing that car.' },
      { who: 'judah', text: 'Shame about your cooling. These old cars are so fragile.' },
      { who: 'lupis', text: 'Careful, Judah. That sounded almost like a confession.' },
    ],
    lose: [
      { who: 'sophi', text: 'It cooked. Not your fault. Well, partly your fault. Again.' },
    ],
  },

  // ---- Chapter 4: The Apex --------------------------------------------------------------------
  {
    id: 'rivals', chapter: 3, title: 'RIVALS', track: 'HARBOR LIGHTS', laps: 4, grid: 'random', aiBuff: 0.03,
    rivals: [JUDAH(0.95, 0.03), ROOK(0.95), ...fillers(3, 0.9, 0.95, [0, 4, 5])],
    goal: { kind: 'beat', who: 'judah' }, bonus: { kind: 'win' }, points: 450, bonusPoints: 200,
    intro: [
      { who: 'lupis', text: 'I should tell you something, {name}. Leopard GP\'s owners pull the funding at the end of this season unless we win the title.' },
      { who: 'lupis', text: 'This season is all we have. You, Sophi, that car. That is the whole team.' },
      { who: 'judah', text: 'Heard your team\'s closing down. I\'ll send flowers.' },
      { who: 'sophi', text: 'Beat him. Just once. Show him he can be beaten.' },
    ],
    win: [
      { who: 'announcer', text: 'JUDAH BEATEN! The Leopard GP rookie has put the champion behind them!' },
      { who: 'judah', text: 'One race. Lucky. The final is a different story.' },
    ],
    lose: [
      { who: 'judah', text: 'Same story every time. Long way down, rookie.' },
    ],
  },
  {
    id: 'final', chapter: 3, title: 'THE APEX', track: 'APEX GRAND PRIX', laps: 5, grid: 'back', aiBuff: 0.035,
    rivals: [JUDAH(0.97, 0.05), ROOK(0.95), CHARLIE(0.93), ...fillers(2, 0.9, 0.95, [0, 3, 4, 5])],
    goal: { kind: 'win' }, bonus: { kind: 'cool' }, points: 600, bonusPoints: 250,
    unlocks: 'ROOKIE SEASON COMPLETE. Every mission can be replayed from the story menu.',
    intro: [
      { who: 'announcer', text: 'The season final at the Apex Grand Prix. Win it and the title goes to Leopard GP. Lose it and it\'s Judah\'s third.' },
      { who: 'lupis', text: 'Vanta protested again. You start from the back. Of course you do.' },
      { who: 'charlie', text: 'I talked my way onto the grid. If Judah gets stuck behind me for a lap or two, well. Accidents happen.' },
      { who: 'sophi', text: 'The car\'s everything I\'ve got. Five laps. Go get it, {name}.' },
      { who: 'judah', text: 'Back of the grid, rookie. Right where you belong.' },
    ],
    win: [
      { who: 'announcer', text: 'LEOPARD GP ARE THE CHAMPIONS! From the county speedway to the top of the Apex Series in one season!' },
      { who: 'judah', text: '...Good race. I mean it. Next year I won\'t need the help.' },
      { who: 'sophi', text: 'Not a scratch on it. Okay, a few scratches. I don\'t care!' },
      { who: 'charlie', text: 'Twenty-two years I waited to see somebody drive like that. Worth it.' },
      { who: 'lupis', text: 'The owners called. The funding is renewed. Welcome to your second season, champion.' },
    ],
    lose: [
      { who: 'judah', text: 'Three titles. Thanks for making it interesting.' },
      { who: 'sophi', text: 'We\'re not done. One more go. Please.' },
    ],
  },
];

// --- garage -------------------------------------------------------------------------------------

export type UpgradeId = 'speed' | 'accel' | 'control' | 'heat' | 'boost';

export interface Upgrade { id: UpgradeId; name: string; blurb: string; perLevel: number; stat: keyof Mods }

/** Small steps on purpose: the AI gets faster each chapter, so the upgrades keep you in the fight. */
export const UPGRADES: Upgrade[] = [
  { id: 'speed', name: 'TOP SPEED', blurb: '+1% top speed per level', perLevel: 0.01, stat: 'top' },
  { id: 'accel', name: 'ACCELERATION', blurb: '+1% pull per level', perLevel: 0.01, stat: 'accel' },
  { id: 'control', name: 'CONTROL', blurb: '+2% cornering grip per level', perLevel: 0.02, stat: 'grip' },
  { id: 'heat', name: 'HEAT RESISTANCE', blurb: '-3% heat from hits per level', perLevel: 0.03, stat: 'heat' },
  { id: 'boost', name: 'BOOST', blurb: '+3% boost power per level', perLevel: 0.03, stat: 'ers' },
];
export const MAX_LEVEL = 10;

/** Points to buy the next level when at `level`. */
export function upgradeCost(level: number): number { return 80 + level * 40; }

/** The player's car mods from their garage levels. */
export function playerMods(save: Save): Mods {
  const m: Mods = { ...NO_MODS };
  for (const u of UPGRADES) m[u.stat] += (save.upgrades[u.id] ?? 0) * u.perLevel;
  return m;
}

/** An AI car's mods: the mission's field-wide buff plus the driver's own edge. */
export function rivalMods(mission: Mission, e: Entrant): Mods {
  const pace = mission.aiBuff + (e.edge ?? 0);
  return { ...NO_MODS, top: pace, accel: pace };
}

// --- saved progress -----------------------------------------------------------------------------

export interface Save {
  name: string;
  points: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Missions completed, and which earned their bonus. */
  done: string[];
  bonus: string[];
}

const SAVE_KEY = 'the-apex-story';

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    return { name: s.name ?? 'ROOKIE', points: s.points ?? 0, upgrades: s.upgrades ?? {}, done: s.done ?? [], bonus: s.bonus ?? [] };
  } catch {
    return null;
  }
}

export function writeSave(s: Save): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* private mode etc.: progress just isn't kept */ }
}

export function newSave(name: string): Save {
  return { name, points: 0, upgrades: {}, done: [], bonus: [] };
}

/** A mission is open once every mission before it is done. */
export function unlocked(save: Save, i: number): boolean {
  return MISSIONS.slice(0, i).every((m) => save.done.includes(m.id));
}

/** Replaying a finished mission pays a quarter, so there's a little to grind but not much. */
export const REPLAY_SHARE = 0.25;

// --- judging a race -----------------------------------------------------------------------------

/** What happened in the race, as far as the goals care. */
export interface Outcome {
  place: number;                       // 1 = won
  ahead: (who: Speaker) => boolean;    // did the player finish ahead of that character?
  bestLap: number;                     // 0 = no lap completed
  overheated: boolean;
}

export function met(goal: Goal, o: Outcome): boolean {
  switch (goal.kind) {
    case 'win': return o.place === 1;
    case 'top': return o.place <= goal.n;
    case 'beat': return o.ahead(goal.who);
    case 'lap': return o.bestLap > 0 && o.bestLap <= goal.seconds;
    case 'cool': return !o.overheated;
    case 'and': return goal.goals.every((g) => met(g, o));
  }
}

export function describe(goal: Goal): string {
  switch (goal.kind) {
    case 'win': return 'Win the race';
    case 'top': return `Finish in the top ${goal.n}`;
    case 'beat': return `Finish ahead of ${CHARACTERS[goal.who].name}`;
    case 'lap': return `Set a lap under ${goal.seconds.toFixed(1)} s`;
    case 'cool': return 'Never overheat';
    case 'and': return goal.goals.map((g, i) => (i ? describe(g).replace(/^./, (c) => c.toLowerCase()) : describe(g))).join(' and ');
  }
}

/** Fill {name} into a line. */
export function say(text: string, save: Save): string {
  return text.replace(/\{name\}/g, save.name);
}
