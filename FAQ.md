# FAQ

**Do I need the game?**
Yes. SOCOM Legacy contains no game data: you need your own copy of SOCOM U.S. Navy SEALs II for the PS2, as a disc
image (ISO) or an extracted folder. The page reads it in your browser; nothing is uploaded.

**Which version of the disc?**
The US retail release (SCUS-97275) is the reference. The page checks the disc when you load it and tells you if it
can't use it.

**Is it an emulator?**
No. No PS2 code runs. The engine is rewritten in TypeScript and three.js, and the game's data is read from your disc.

**Can I play online?**
Online play runs through the project's own services and community hosts. This repository is the client; the servers
aren't in it. Offline play, the test room and the Forge work with no server at all.

**Will the match server be open source?**
We plan to release it once it's stable. The central service (accounts, lobby, ladder) stays with the project.

**Can I host a server?**
Yes, as a validated community host. Easy setup through HyperNode is on the way; until then, reach out on
[Discord](https://discord.gg/RrtTEdvECV).

**Does it play like the original?**
That's the goal, one to one. Every value is read from the original, and anything not read yet is a named placeholder.
If something feels off, it probably is: [report it](https://github.com/Scotho/socom-legacy/issues/new/choose).

**What do I need to build it?**
Node 22 or newer and a browser with WebGPU or WebGL2. See the README's Quickstart.

**Can I make mods or maps?**
Yes. The Forge, texture and model packs, and community content are all open lanes. Packs follow Thunderstore's format.

**How do I contribute?**
Start with [CONTRIBUTING.md](CONTRIBUTING.md), then claim a lane or pick an issue. Questions are welcome on Discord.

**Is this affiliated with Sony?**
No. SOCOM is a trademark of Sony Interactive Entertainment, and Zipper Interactive made the game. This is a fan
project, not affiliated with or endorsed by either.
