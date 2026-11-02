// Licks that ship with the app: bebop and hard-bop vocabulary, written out in ABC notation. Read-only, never stored.
import type { Lick } from "./data/types";

const L = (id: string, title: string, tags: string[], key: string, progression: string, notation: string, body: string): Lick =>
  ({ id: "starter-" + id, ownerId: "", ownerName: "", mine: false, title, body, tags, progression, key, notation, createdAt: "", updatedAt: "" });

export const STARTER_LICKS: Lick[] = [
  L("bird-251-f", "Bird ii–V–I in F", ["ii–V–I", "bebop", "Parker"], "F", "Gm7 | C7 | Fmaj7",
    `K:F
"Gm7"zBdf agfd | "C7"c=B_BA GEF^G | "Fmaj7"A6 z2 |]`,
    "Up the ii from the 3rd to the 9th, down the C bebop scale, then E–F–G♯ climbs into A, the 3rd of F. Parker played this shape constantly."),
  L("enclose-251-bb", "Enclosures, ii–V–I in B♭", ["ii–V–I", "enclosure", "bebop"], "Bb", "Cm7 | F7 | Bbmaj7",
    `K:Bb
"Cm7"zd=Bc ed_BG | "F7"B^GAc ecA^c | "Bbmaj7"d6 z2 |]`,
    "Every target is surrounded before it lands: D and B around C, B♭ and G♯ around A, then C♯ slides up into D."),
  L("dim-minor-cm", "Diminished line, minor ii–V–i", ["minor", "ii–V–i", "diminished"], "C", "Dm7b5 | G7b9 | Cm6",
    `K:Cm
"Dm7b5"zdfa gfdc | "G7b9"=Bdfa gfd=B | "Cm6"c6 z2 |]`,
    "Over G7♭9 play a diminished arpeggio from the 3rd (B D F A♭). The B turns back on itself and resolves up to C."),
  L("tritone-c", "Tritone sub, ii–V–I in C", ["ii–V–I", "tritone sub"], "C", "Dm7 | Db7 | Cmaj7",
    `K:C
"Dm7"zAce dcAG | "Db7"F_AB_d c_B_AF | "Cmaj7"E6 z2 |]`,
    "D♭7 for G7. Arpeggiate it from the 3rd (F A♭ C♭ D♭), fall back down through B♭ and A♭, and F drops a half step into E."),
  L("altered-c", "Altered dominant into C", ["ii–V–I", "altered"], "C", "Dm7 | G7alt | Cmaj7",
    `K:C
"Dm7"zdfa c'bag | "G7alt"z_af_e _dB_AF | "Cmaj7"E6 z2 |]`,
    "Leave a breath on beat one of the V, then come down the altered scale: ♭9, 7, ♯9, ♭5, 3, ♭9. F to E finishes it."),
  L("sonny-251-eb", "Triplet pickup, ii–V–I in E♭", ["ii–V–I", "triplets", "hard bop"], "Eb", "Fm7 | Bb7 | Ebmaj7",
    `K:Eb
"Fm7"z(3fgaf cAFG | "Bb7"B=A_AG FEDF | "Ebmaj7"G6 z2 |]`,
    "A quick triplet up to the A♭ kicks the line off, then the B♭ bebop scale runs down with the chromatic A natural on the way."),
  L("turnaround-c", "I–VI–ii–V turnaround in C", ["turnaround", "ii–V–I"], "C", "Cmaj7 A7b9 | Dm7 G7 | C6",
    `K:C
"Cmaj7"zGEC "A7b9"^CEG_B | "Dm7"AFDF "G7"Bdf_a | "C6"g6 z2 |]`,
    "Two chords to the bar. Each one is an arpeggio from the 3rd, and B♭ and A♭ (the ♭9s) lead you into the next chord."),
  L("rhythm-bb", "Rhythm changes turnaround in B♭", ["rhythm changes", "turnaround"], "Bb", "Bb6 G7b9 | Cm7 F7 | Bb6",
    `K:Bb
"Bb6"dcBG "G7b9"_A=Bdf | "Cm7"edcB "F7"Acec | "Bb6"d6 z2 |]`,
    "The bars that close every A section of I Got Rhythm. The G7♭9 arpeggio from A♭ is a diminished chord, which sets up C minor."),
  L("blues-f", "Blues call and answer in F", ["blues", "hard bop"], "F", "F7 | Bb7",
    `K:F
"F7"z2{^G}AF _A=AcF | "Bb7"_A2FD F2z2 |]`,
    "Grace note into the major 3rd, then rub it against the minor 3rd. Over B♭7 the A♭ is now the 7th and the answer settles on F."),
];
