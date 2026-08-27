const blockedFragments = [
  'FUCK', 'SHIT', 'BITCH', 'ASSHOLE', 'BASTARD', 'CUNT', 'COCK', 'DICK', 'PENIS', 'VAGINA', 'PUSSY',
  'PORN', 'WHORE', 'SLUT', 'NIGGER', 'NIGGA', 'FAGGOT', 'RETARD',
  'MOTHERFUCK', 'JERKOFF', 'JIZZ', 'SEMEN', 'HENTAI',
] as const;

const blockedWords = new Set(['ASS', 'BADASS', 'DAMN', 'HELL', 'CRAP', 'PISS', 'SUCK', 'RAPE', 'SEX', 'TIT', 'TITS', 'BOOB', 'BOOBS', 'NAZI', '69', '420']);

const leet: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G' };

export type NicknameResult = { ok: true; name: string } | { ok: false; name: string; message: string };

export function normalizeNickname(value: unknown) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function moderationForms(name: string) {
  const decoded = [...name].map((character) => leet[character] ?? character).join('');
  const words = decoded.split(/[^A-Z]+/).filter(Boolean).map((word) => word.replace(/(.)\1{1,}/g, '$1'));
  const joined = decoded.replace(/[^A-Z]/g, '').replace(/(.)\1{1,}/g, '$1');
  return { words, joined };
}

export function checkNickname(value: unknown): NicknameResult {
  const name = normalizeNickname(value);
  if (!/^[A-Z0-9 _-]{2,12}$/.test(name)) {
    return { ok: false, name, message: 'Use 2–12 letters, numbers, spaces, _ or -.' };
  }
  const { words, joined } = moderationForms(name);
  const blocked = blockedWords.has(name) || blockedFragments.some((fragment) => joined.includes(fragment)) || words.some((word) => blockedWords.has(word));
  if (blocked) return { ok: false, name, message: 'Choose a family-friendly nickname.' };
  return { ok: true, name };
}

export function publicNickname(value: unknown) {
  const result = checkNickname(value);
  return result.ok ? result.name : 'SUNCRESTER';
}
