# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Working jazz musicians: Dan and his bandmates in the closed beta. They prepare for gigs at home and play them on the bandstand, often reading from a tablet or phone.

## Product Purpose
Niu Real Book helps them build setlists, read charts in the right key, practise with a backing band or recordings, and share all of it with the band. It succeeds when a musician can prepare for a gig and play it from the app alone.

## Positioning
Unlike iReal Pro or a PDF real book, this book knows your setlists and your band. Charts, keys, notes, recordings and band chat are all attached to the gig you're playing.

## Operating Context
- **Prep:** happens at home on a laptop or tablet.
- **On the gig:** dim stages, a quick glance between tunes, one hand free.
- **Sharing:** bands share setlists and notes; Spotify is used for listening and playlists.
- **Feedback:** testers report bugs and ideas through the in-app "Bugs & ideas" button.

## Capabilities and Constraints
- **Stack:** Next.js App Router, TypeScript and plain CSS (`app/globals.css`).
- **Storage:** Supabase (accounts, closed beta, magic-link sign-in) or local IndexedDB.
- **Sources:** iReal Pro charts, uploaded chart files, Spotify embeds, and Niu AI setlist drafts.

## Brand Commitments
- **Name:** Niu Real Book.
- **Visual source:** Dan's earlier site Gigle (github.com/xiaoniuniu89/giglep4) is the binding reference. It uses the neon Real Book cover colours, Luckiest Guy hand-lettering, Special Elite typewriter text, and stick-figure musician art on its error pages.

## Evidence on Hand
- **Error-page art:** the 404, 403 and 500 artwork from Gigle (sax player, stop hand, angry guitarist).
- **Customers:** there are no testimonials or user counts; don't invent any.

## Product Principles
- **Glanceable on the bandstand:** a chart or the next tune must be readable in one look.
- **The gig is the unit:** everything hangs off a setlist and a band.
- **Low cognitive load:** keep text short, use icons with labels, and put creation behind a button.
- **Closed beta, honest UI:** no dev labels and no fake claims.
