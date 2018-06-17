[![Donate](https://img.shields.io/badge/Donate-PayPal-ff69b4.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=C6BU555NMQJD6)
BHS should donate here.

![DPS](https://preview.ibb.co/hzww8T/dps.jpg)

## Introduction

Tera DPS monitor.(TDM)
Internal dps UI
Light cpu usage when gathering dps data in Raid.

## Prerequisite

- nodejs  [here](https://nodejs.org/en/)
- tera proxy

## Install

1. Download the dps via clicking in the button `Clone or Download` and then on `Download Zip`.

2. Uncompress dps

   place the resulting folder in `Tera-proxy\bin\node_modules\`

If you are having problem with installation, just download [here](https://github.com/rickhyun/dps/releases/download/v1.1-beta/tera-proxy-dps.2.zip)

## Usage

- It pops up automatically when you spawn in a dungeon
- Type "!dps u" if you want to open UI

## Functions

- Enraged notifier on UI
- If you don't want to pop up dps meter, press Close button on bottom. (X button on title is not same)
- you can automate party leaving message by setting party_leaving_msg in config.json. Then press LeaveParty button.
- Reset clears history and npc data (), Data is reset by switching charactors anyway.
- DPS history is shown in the UI
- Whisper lastest dps to a user type in the input
- Right click on LFG pops up inspecting window (debug mode only)

## Online Support

[DPS](https://discord.gg/XsTscwZ)

## Referenced source

[Tera Modes](https://discord.gg/8X7g6T3)
@Gl0#0588 (Shinrameter) : monster xml data and class-icons
@seraphinush#5417 : enraged-notifier

## License
GPL
