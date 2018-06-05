[![Donate](https://img.shields.io/badge/Donate-PayPal-ff69b4.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=C6BU555NMQJD6)
Donation.

![DPS](https://preview.ibb.co/n7X8f8/dps.jpg)

## Introduction

Tera DPS meter.(only for boss monster)
Targeting less cpu/memory resources.
Enraged notifies in real time by notice message size as like picture.

## Prerequisite

- nodejs  [here](https://nodejs.org/en/)
- tera proxy (recommand [Caali's](https://cdn.discordapp.com/attachments/394446642465603584/435128362294575104/tera-proxy.7z))
- Pinki [ui](https://github.com/pinkipi/ui)

## Install

1. Download the modules([ui](https://github.com/pinkipi/ui),dps) via clicking in the button `Clone or Download` and then on `Download Zip`.
2. Uncompress [ui](https://github.com/pinkipi/ui) and
   place the resulting folder in `Tera-proxy\bin\node_modules\ui`
   cmd> cd Tera-proxy\bin\node_modules\ui\
   cmd> install express: npm i express   
3. Uncompress dps and place the resulting folder in `Tera-proxy\bin\node_modules\dps` and you're set.

## Usage

- type this once login : "!dps u" or it pops up automatically when you spawn in dungeon.

## Commands

- dps u (ui)
- dps h (history) : check proxy channel
- dps nd 1000000 : if you want to spam notification, make it lower
