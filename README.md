# Settlers of Iowa City

An online, phone-friendly multiplayer hex-island settlement game for 1–4 players, with optional computer players.

- **Play:** open the site, enter your name, create a game, and share the code or invite link.
- **Rules:** the full classic base-game rules — snake-draft set-up, dice production, the robber and 7s (discard half over 7 cards), roads/settlements/cities with piece limits and the distance rule, player trades, 4:1 bank and 3:1 / 2:1 harbors, the 25-card development deck (knights, victory points, road building, year of plenty, monopoly), Longest Road, Largest Army, bank shortages, and 10 points to win.
- **How it runs:** a static page in `public/`, one Netlify Function (`netlify/functions/api.mts`) that enforces every rule on the server, and Netlify Blobs to store each game. Hidden information (hands, development cards) is never sent to other players.
- **Tests:** `node test/sim.mjs 400` plays 400 full computer games and checks the rules hold throughout.
