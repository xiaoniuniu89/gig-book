# Band samples

All the backing band's sounds ship with the app. Every set is public domain or CC0.

## Piano: `piano.json` + `piano/`

[Splendid Grand Piano](https://github.com/sfzinstruments/SplendidGrandPiano), Akai samples released into the
public domain. The pp, mp and mf layers only (the band never plays softer or louder), keys G0 to A5, 5 s with a fade.

## Bass: `bass.json` + `bass/`

[D. Smolken's 1958 Rubner double bass](https://github.com/sfzinstruments/dsmolken.double-bass), pizzicato, CC0.
Two velocity layers, two round robins each, 2.5 s with a fade, mono.

`piano.json` and `bass.json` list regions: `{ lokey, hikey, center, lo, hi, files }`. A region plays its files
(round robin) for keys `lokey`–`hikey` and MIDI velocities `lo`–`hi`, repitched from `center`.

## Drums: `drums.json`

The drum hits as base64 MP3s, grouped by drum and velocity layer (`{ [drum]: [{ lo, hi, samples: [roundRobin...] }] }`).

Source: [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) by Versilian Studios,
played by Austin McMahon, CC0 1.0. Mid (stereo kit) mic only, trimmed with a short fade:

| drum | articulation |
| --- | --- |
| ride | ride, normal hit |
| hat | hi-hat pedal (foot chick) |
| hatClosed | hi-hat closed, stick |
| hatOpen | hi-hat open |
| kick | kick, snares on |
| snare | snare off-centre |
| rim | snare cross-stick |

The kit has no brushes; the ballad sweep and the count-in clicks are synthesised in `lib/band/sounds.ts`.
