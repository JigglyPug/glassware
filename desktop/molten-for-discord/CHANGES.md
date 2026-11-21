# Molten for Discord: what changed

Newest first.

## 1.0.12 · 2026-11-21

- Removing a favorite, a saved message, a folder or a reminder asks first, right in the row: Cancel or Move to trash.
- A trash can next to Channels, Messages and Reminders opens the trash. Put anything back, or delete it for good, which asks too. Empty trash clears it all at once.
- Reminders you mark done show up there too, crossed off, and can go back on your list.
- The trash and finished reminders clear on their own after 30 days.

## 1.0.11 · 2026-11-20

- In Remind me, picking Tonight, Tomorrow or Next week turns the dial to match, and so does picking an exact day and time.
- Tonight is 8 PM, or 10 PM once 8 is close, and it's left out late in the evening, so it can never land after Tomorrow. Just after midnight, Tomorrow means the morning coming up.
- Lighter on busy channels: with no picture viewer open, new images no longer trigger a sweep of the whole page.

## 1.0.10 · 2026-11-19

- The bubbles card says it the way you'd say it ("Lava Lounge took a third of your Discord time"), and "What changed?" puts a big jump in words ("more than halved").
- The bubble key is in plain sentences, and the line under the bubbles shows the biggest one until you point at one.
- Settings descriptions say what happens when a switch is off in a sentence, and a few read more clearly.
- The last date under the day charts no longer drops onto a second line when the range ends in a part-week.

## 1.0.9 · 2026-11-18

- A new icon: a leaning lava blob with flame and drips, in Molten for Reddit's orange and Molten Tools' red on Discord's purple.

## 1.0.8 · 2026-11-17

- The save menu waits for you. Picking a folder or a reminder time used to save the message on the spot and close the menu; now they're just picks, and the button at the bottom is Save. Fill in any of the note, the folder and the reminder, change your mind as often as you like, and Save does all of it at once. A line above the button says what it will do. Pick only a reminder and you get just the reminder; pick nothing and the message goes to Unsorted. "No reminder" undoes a time you picked.

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
