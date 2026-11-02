// Licks that ship with the app: common bebop vocabulary, written in C. Read-only and never stored.
import type { Lick } from "./data/types";

const L = (id: string, title: string, tags: string[], progression: string, body: string): Lick =>
  ({ id: "starter-" + id, ownerId: "", ownerName: "", mine: false, title, body, tags, progression, key: "C", createdAt: "", updatedAt: "" });

export const STARTER_LICKS: Lick[] = [
  L("arp-scale", "Up the ii, down the V", ["ii–V–I", "arpeggio"], "Dm7 G7 | Cmaj7",
    "Dm7: D F A C (up the arpeggio). G7: B A G F (step down from the 3rd). Cmaj7: land on E, the 3rd."),
  L("guide-tones", "Guide-tone line", ["ii–V–I", "guide tones"], "Dm7 G7 | Cmaj7",
    "Hold F over Dm7 (its 3rd); it becomes the 7th of G7, then falls a half step to E, the 3rd of Cmaj7. Second voice: C → B → B (7th → 3rd → 7th)."),
  L("1235", "1-2-3-5 cells", ["ii–V–I", "patterns", "Coltrane"], "Dm7 G7 | Cmaj7",
    "Dm7: D E F A. G7: G A B D. Cmaj7: C D E G. Same shape from each root; try it descending too (5-3-2-1)."),
  L("enclosure", "Enclose the 3rd", ["ii–V–I", "enclosure", "bebop"], "Dm7 G7 | Cmaj7",
    "Dm7: A F E D. G7: G A B D F. Then F and D♯ around the target: F D♯ | E on beat 1 of Cmaj7."),
  L("bebop-dom", "Bebop dominant run", ["ii–V–I", "bebop scale"], "Dm7 G7 | Cmaj7",
    "Over G7, eighth notes straight down from the root: G F♯ F E D C B A. The added F♯ keeps chord tones on the beats. Land on G over Cmaj7."),
  L("dim-b9", "Diminished from the 3rd (♭9)", ["ii–V–I", "altered", "diminished"], "Dm7 G7b9 | Cmaj7",
    "Dm7: D F A C. G7♭9: B D F A♭ (a diminished 7th arpeggio from the 3rd). A♭ falls to G over Cmaj7."),
  L("altered", "Altered resolution", ["ii–V–I", "altered"], "Dm7 G7alt | Cmaj7",
    "G7alt: F E♭ C♯ B, then A♭ (the ♭9) resolving down to G, the 5th of Cmaj7."),
  L("minor", "Minor ii–V–i", ["minor", "ii–V–i"], "Dm7b5 G7b9 | Cm6",
    "Dm7♭5: D F A♭ C. G7♭9: B A♭ F D. Cm6: E♭, the minor 3rd. The A♭ and the B carry the sound."),
  L("tritone", "Tritone-sub line", ["ii–V–I", "tritone sub"], "Dm7 Db7 | Cmaj7",
    "Dm7: D F A C. D♭7: B A♭ F E♭ (B is the 7th, spelt C♭). Cmaj7: D then E. The bass falls D → D♭ → C under it."),
  L("turnaround", "I–VI–ii–V turnaround", ["turnaround", "ii–V–I"], "Cmaj7 A7b9 | Dm7 G7",
    "Cmaj7: E G B C. A7♭9: C♯ E G B♭. Dm7: A F D C. G7: B D F A♭, back to G at the top."),
  L("blues", "Blues: minor to major 3rd", ["blues"], "C7 | F7",
    "C7: E♭ E G A C (bend the ♭3 up to the 3rd). F7: A G E♭ C, the E♭ now the 7th of F7."),
  L("cadence-c", "Bird-style cadence", ["ii–V–I", "bebop"], "Dm7 G7 | Cmaj7",
    "Dm7: F E D C. G7: B D F A, then A♭ G as a chromatic step down. Cmaj7: E, with D on the way (D–E)."),
];
