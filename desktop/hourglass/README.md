<div align="center">

<img src="../../assets/icons/hourglass.png" alt="Hourglass icon" width="112">

<img src="images/banner.svg" alt="Hourglass: Screen time and lockdown for every site." width="100%">

[![Install](https://img.shields.io/badge/Install-v1.5.14-5b5bd6?style=for-the-badge)](https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/hourglass/hourglass.user.js) [![Website](https://img.shields.io/badge/Website-product%20page-222?style=for-the-badge)](https://jigglypug.github.io/glassware/desktop/hourglass/)

![Runs on](https://img.shields.io/badge/runs%20on-Every%20site-555?style=flat-square) ![Platform](https://img.shields.io/badge/platform-Desktop%20%2B%20phone-555?style=flat-square)

<img src="images/main-cut.webp" alt="Hourglass in light and dark" width="620">

</div>

Hourglass tracks how long you spend on every site and blocks the distracting ones on a schedule. During lockdown the settings lock too, so you cannot talk yourself out of it in the moment.

## Getting started

A fresh install starts in setup mode: Hourglass counts your screen time but blocks nothing and locks no settings. Check your sites and schedule, then tap **Start lockdown** on the welcome card. If you start during scheduled hours, you can begin right away or wait until the current block ends.

## Features

- **A dashboard that tells you something**: Each card answers one question in a sentence: how today compares with your usual, what changed, when you drift and whether lockdown is working.
- **A schedule you draw**: Drag lockdown blocks onto each day in 30-minute steps, or start from presets like 9–5, evenings or overnight.
- **Passes, not loopholes**: A few daily passes that open only the site you're on, with a timer and a wait to think it over.
- **Lockdown that holds**: An "Is this important?" screen with a delay, and looser settings only kick in after lockdown ends.
- **Your lists**: Socials, Shopping, Music and Custom. Each site can follow the schedule or stay blocked.
- **Suggestions from your browsing**: Sites you spend 30 minutes or more on each day get suggested for a list, or you can ignore them.
- **Music mode**: Let music through during lockdown, with listening time tracked apart from screen time.
- **Late-night nudge**: A friendly reminder to take a break when you're still browsing past bedtime.
- **On your phone too**: The same script switches to a bottom-sheet menu on phones, with the full dashboard in one column, bigger touch targets and tap-for-details charts. Listening time stays on the PC.
- **Stays on your device**: Only site names are kept, never full addresses or page titles.

## A closer look

<table>
<tr><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/schedule-light.webp"><img src="images/schedule.webp" width="400"></picture><br><sub><b>Schedule</b></sub></td><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/sites-light.webp"><img src="images/sites.webp" width="400"></picture><br><sub><b>Sites</b></sub></td></tr>
<tr><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/settings-light.webp"><img src="images/settings.webp" width="400"></picture><br><sub><b>Settings</b></sub></td></tr>
</table>

## On your phone

The same script switches to a phone layout on its own: a bottom-sheet menu, the same dashboard in one column with charts you can tap for details, and bigger touch targets. Open it from the Tampermonkey menu, or from the Open Hourglass link on any block screen.

<table>
<tr><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/phone-dashboard-light.webp"><img src="images/phone-dashboard.webp" width="200"></picture><br><sub><b>Dashboard</b></sub></td><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/phone-schedule-light.webp"><img src="images/phone-schedule.webp" width="200"></picture><br><sub><b>Schedule</b></sub></td><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/phone-block-light.webp"><img src="images/phone-block.webp" width="200"></picture><br><sub><b>Block screen</b></sub></td><td align="center" valign="top"><picture><source media="(prefers-color-scheme: light)" srcset="images/phone-nudge-light.webp"><img src="images/phone-nudge.webp" width="200"></picture><br><sub><b>Late-night nudge</b></sub></td></tr>
</table>

## What's new

- **1.5.14** (2026-11-20): Under "How much are you online?", a short list fills the space below the chart: your busiest and quietest days and how many beat your average. The chart is a little taller too. "Reset all stats" asks first, in words, and only erases when you press OK. The main switch says "Everything is on. Turn off to stop every feature at once." and "Everything is off. Your settings are kept.", like the other scripts.
- **1.5.13** (2026-11-19): A new icon in the family style: the sand is lava, falling through the neck in drops and piling up at the bottom. The header and block screen draw it too. On the block screen and the lockdown screen, the lava drips: a glob swells at the neck, stretches and drops onto the pile, twice before each flip. It stands still if your device asks for less motion.
- **1.5.12** (2026-11-19): "Where does your time go?" says it the way you'd say it: "Socials took half your time in the past 7 days." When two categories are about even, it says so. "What changed?" puts a big jump in words ("more than doubled"), and "When do you drift?" starts with the hours: "8 PM to 11 PM was your busiest stretch." Blocked tries are whole numbers now ("about 3 times a lockdown day"). The bubble key, the table heading and a few hints are plain sentences. The line under the bubbles shows the biggest category until you point at one. The take-a-break switch is called Late-night nudge, as on the website. On phones, the day picker in Schedule spans the card's width, with the day's name on the left and its switch on the right.

[Every change](CHANGES.md)
