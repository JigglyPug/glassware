# Molten for Discord: what changed

Newest first.

## 1.0.7 · 2026-11-17

- GIFs opened full size get the lava around them too. A GIF opens at its own small size, which Molten took for too small to be the viewer; inside Discord's viewer, anything from 96px now counts (a profile card's dialog still doesn't).

## 1.0.6 · 2026-11-17

- Pictures opened full size get the lava around them now. Discord's viewer dims the app with a layer whose dark sits on a pseudo-element, which Molten didn't see; it now goes by the viewer's dialog instead, and clears the dimming wherever it's painted.

## 1.0.5 · 2026-11-17

- Pictures opened full size now get the lava around them too, not just videos: Molten finds Discord's viewer by what it looks like (a picture in the middle of the screen with Discord's dimmed layer behind it) instead of by names Discord uses only some of the time. Small pictures count; a profile card doesn't.

## 1.0.4 · 2026-11-17

- **Lava around opened media** (Lava tab, Colors; on by default): a picture or video opened full size sits in light glass over the lava, in the picture's own colors, instead of on a dark backdrop with the chat behind it. A video in fullscreen keeps the lava around it instead of black bars. Closing it brings the chat straight back.

## 1.0.3 · 2026-11-17

- Lighter while a video or stream plays: only the lava's video follows the frame rate now. Keeping the button in place, cleaning the page, checking reminders and counting activity stay on their own clock, instead of running up to 60 times a second.
- Switched off, Molten stops watching the page entirely.
- Reminders: at the limit of 100, a new one never pushes out one that's due sooner (a finished reminder goes first, then the one furthest away). "In 1 month" from the 31st stops at the end of next month instead of spilling into the one after.
- Export CSV: a server or channel named like a spreadsheet formula starts with an apostrophe, so a spreadsheet shows it as text instead of running it.
- Export data leaves out the names Screenshot safe hides inside saved messages, reminders and notes too (they read "User"). Your data now says what a saved message keeps: a short preview (its first 80 characters), its author and a link.

## 1.0.2 · 2026-11-17

- **Your data** in General, laid out like Hourglass's: **Export CSV** (your activity, a row per day and channel), **Export data** (settings, lava looks, favorites, saved messages, reminders, notes, server colors), **Import data** (adds what's in a backup to what you have; nothing is removed) and **Erase activity**, which asks first and waits for OK. Exports leave out the names Screenshot safe hides. Erasing activity moved here from the Activity tab.
- Mention blobs: every message gets its own blobs, in their own places, at their own speed, instead of a run of mentions playing the same animation side by side.
- The icon shows in Tampermonkey's list again: if it didn't download when you installed, this update fetches it.

## 1.0.1 · 2026-11-17

- Channels opened while they had unread messages showed as "• Discord". Names now come from the channel list, and names saved that way fix themselves.
- Screenshot safe now blurs your hidden names inside Molten's own panel, favorites, popups and Activity tab too, word by word.
- Point at anything Screenshot safe blurred to see it. A screenshot can't point, so it stays hidden there.
- A blurred name no longer stays blurred after you switch servers: what Discord reuses for the next server's name comes out of the blur.
- Names are matched as whole words, so hiding "Sam" no longer blurs "Samsung".
- Mention blobs are round drops of a fixed size that rise and sink inside the glow, instead of blurred ovals stretched across the chat. Mentions in a row share one box with a straight bar down the left.

## 1.0.0 · 2026-11-17

- First release: a lava-lamp background made from the image, video, stream or profile you're looking at, or the server's icon, with frosted glass over it.
- Favorite channels, threads and DMs drip down from the lava button when you point at it.
- Saved messages and reminders, each with an optional note so you remember why.
- An Activity tab shows where your Discord time goes as bubbles you can point at and click, with your daily time, messages and busiest hours. It stays in your browser.
- Messages that mention you glow, the title bar and seek bar match the lava, and Screenshot safe and privacy blur keep things private.
