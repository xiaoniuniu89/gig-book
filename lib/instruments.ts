// The shared list of instruments for the account page and for bands (R10, R11). Anything else is a custom entry.
export const INSTRUMENTS = [
  "Vocals", "Piano", "Keys", "Organ", "Guitar", "Bass", "Double bass", "Drums", "Percussion", "Alto sax", "Tenor sax",
  "Baritone sax", "Soprano sax", "Trumpet", "Trombone", "Clarinet", "Flute", "Violin", "Vibes", "Other",
] as const;

/** The list's own spelling of an instrument (any case), or the text as typed. */
export const canonInstrument = (s: string): string => {
  const t = s.trim();
  return INSTRUMENTS.find(i => i.toLowerCase() === t.toLowerCase()) || t;
};

/** Cleaned list: canonical spelling, no blanks or repeats. */
export const canonInstruments = (xs: string[]): string[] => [...new Set(xs.map(canonInstrument).filter(Boolean))];

/** The shorter list for transcriptions: the usual jazz solo instruments, horns first. */
export const SOLO_INSTRUMENTS = [
  "Trumpet", "Alto sax", "Tenor sax", "Soprano sax", "Baritone sax", "Trombone", "Clarinet", "Flute",
  "Piano", "Organ", "Vibes", "Guitar", "Bass", "Drums", "Vocals",
] as const;
