# Gig Book

Setlists from iReal Pro with analysed chord charts, a built-in backing band, and Spotify recordings.

Live: https://xiaoniuniu89.github.io/gig-book/

## What it does
- **Import** an iReal Pro playlist (share it from iReal Pro as HTML). Make it a setlist, or add it to your library.
- **Charts** show the scale for each stretch (chord scales or Barry Harris), the 3rd and 7th of every chord, and what the harmony is doing (ii–V–I of IV, backdoor, line cliché…). Transpose with − / +.
- **Band**: piano, bass and drums generated from the chords. Any key, any tempo, mute any instrument, loop a section. The current bar is highlighted.
- **Record**: the Spotify player sits in the dock. Load a setlist's playlist and the chart follows the track that's playing. Search Spotify for other versions of a tune and save the ones you like.
- **Practice gig**: plays a set start to finish with the band.

Your library, setlists and settings live in your browser (IndexedDB). Nothing you import is uploaded.

## Spotify
Searching and chart-following need a Spotify login. The app uses the Spotify Web API with PKCE (client ID in `js/spotify.js`), redirect URI `https://xiaoniuniu89.github.io/gig-book/`.

## Code
Plain ES modules, no build step.
- `js/ireal.js`: iReal Pro link parser, form unrolling (repeats, endings, D.C./D.S., codas)
- `js/theory.js`, `js/chart.js`: analysis and chart rendering
- `js/band/`: the backing band (generator, scheduler, sounds)
- `js/spotify.js`: login, search, embedded player

## Credits
Piano and bass samples: FluidR3_GM by Frank Wen, via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
