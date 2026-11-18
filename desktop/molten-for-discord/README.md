<div align="center">

<img src="../../assets/icons/molten-for-discord.png" alt="Molten for Discord icon" width="112">

<img src="images/banner.svg" alt="Molten for Discord: Molten glass for Discord" width="100%">

[![Install](https://img.shields.io/badge/Install-v1.0.6-5865f2?style=for-the-badge)](https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/molten-for-discord/molten-for-discord.user.js) [![Website](https://img.shields.io/badge/Website-product%20page-222?style=for-the-badge)](https://jigglypug.github.io/glassware/desktop/molten-for-discord/)

![Runs on](https://img.shields.io/badge/runs%20on-discord.com-555?style=flat-square) ![Platform](https://img.shields.io/badge/platform-Desktop-555?style=flat-square)

<img src="images/main-cut.webp" alt="Molten for Discord in light and dark" width="620">

</div>

Molten for Discord puts a lava-lamp background made from what you're looking at behind frosted-glass panes, and keeps your favorite channels one point away on the lava button.

## Features

- **Lava from what you're looking at**: The background comes from the image, video or stream in the middle of the chat, or the profile you open. With nothing on screen it takes the server's icon colors, or Discord purple.
- **Glass over the lava**: The server list, channels, chat and member list turn to frosted glass, with Calm, User and Crazy profiles that each keep their own look.
- **Favorites on the lava button**: Point at the lava button and your favorite channels, threads and DMs drip down from it. Reorder them, color them by server and see Recent in the panel.
- **Saved messages and reminders**: Point at a message and click its lava drop to save it to a folder of your own, or to be reminded later, with a note saying why. Reminders you missed while Discord was closed show up when it opens.
- **Your activity, at a glance**: Where your Discord time goes as a cluster of bubbles, one per server or DM: point at one and it swells, click it to go there. Daily time, messages and busy hours sit beside it, compared with your own history, and none of it leaves your browser.
- **Voice in the lava**: In a call, the lava takes the avatar of whoever is talking.
- **Mentions and keywords that glow**: Messages that mention you, or use words you pick, get a lava glow instead of a flat bar, with lava blobs around them if you like.
- **Colors from the art**: The title bar and the video seek bar take their color from the lava. When nothing on screen gives a color, Prism takes the title bar back.
- **Screenshot safe and privacy blur**: Hide your own name and avatar, and blur images, DMs, server icons or whole channels until you point at them.
- **Easy on your GPU**: The lava pauses while you scroll and when Discord isn't the active window, and calms down during calls and streams.

## A closer look

<table>
<tr><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/lava-light.webp"><img src="images/lava.webp" width="400"></picture><br><sub><b>Lava</b></sub></td><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/favorites-light.webp"><img src="images/favorites.webp" width="400"></picture><br><sub><b>Favorites</b></sub></td></tr>
<tr><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/messages-light.webp"><img src="images/messages.webp" width="400"></picture><br><sub><b>Saved messages</b></sub></td><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/reminders-light.webp"><img src="images/reminders.webp" width="400"></picture><br><sub><b>Reminders</b></sub></td></tr>
<tr><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/activity-light.webp"><img src="images/activity.webp" width="400"></picture><br><sub><b>Activity</b></sub></td><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/privacy-light.webp"><img src="images/privacy.webp" width="400"></picture><br><sub><b>Privacy</b></sub></td></tr>
</table>

## What's new

- **1.0.6** (2026-11-17): Pictures opened full size get the lava around them now. Discord's viewer dims the app with a layer whose dark sits on a pseudo-element, which Molten didn't see; it now goes by the viewer's dialog instead, and clears the dimming wherever it's painted.
- **1.0.5** (2026-11-17): Pictures opened full size now get the lava around them too, not just videos: Molten finds Discord's viewer by what it looks like (a picture in the middle of the screen with Discord's dimmed layer behind it) instead of by names Discord uses only some of the time. Small pictures count; a profile card doesn't.
- **1.0.4** (2026-11-17): **Lava around opened media** (Lava tab, Colors; on by default): a picture or video opened full size sits in light glass over the lava, in the picture's own colors, instead of on a dark backdrop with the chat behind it. A video in fullscreen keeps the lava around it instead of black bars. Closing it brings the chat straight back.

[Every change](CHANGES.md)
