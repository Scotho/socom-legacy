{{PACK_NAME}} -- the SOCOM II parity harness
Page {{PAGE_TAG}}, built {{STAMP}}.

This folder plays the original SOCOM U.S. Navy SEALs II (in the PCSX2 emulator, with the r0004 update) and
SOCOM Legacy (the browser version) side by side, driven by one controller, and records both so we can compare them.
It needs Windows 10 or 11, a game controller (an Xbox-style pad), and Microsoft Edge or Google Chrome.


THREE STEPS
-----------

1. Unzip this folder anywhere you like -- your Desktop or Documents is fine -- but NOT inside a "Program Files" folder
   (the harness writes its recordings inside this folder), and not deep inside other folders: the pack's longest
   file path is 144 characters, and Windows stops an unzip whose paths pass 260.

2. Put your own SOCOM II (US) disc image (.iso) in the "drop-here" folder,
   {{BIOS_STEP}}
   Only one .iso in drop-here, please.

3. Double-click "START HERE.cmd". A black window opens (leave it open) and then a checklist page in your browser.


WHAT TO EXPECT
--------------

- The checklist page shows a green or red line for each thing the harness needs: your image, your BIOS, the maps
  (prepared from your image the first time; press Prepare and wait), the video recorder, a browser and your pad.
- Press Play. Two windows open: the original game in PCSX2 and SOCOM Legacy in a browser window. Play with your pad:
  it drives both games at once. Leave the two windows where they appear.
- Press Pause to hold both games, Play to go on.
- Press Record to record a video clip of both windows; press it again to stop the clip. Record as many as you like.
- Press Save when you are done. Both games are closed and one file is written in the "handoff" folder; the page
  names it. Send us that file (by the channel we agreed on). That's all.
- To stop at any time, close the black window.


WHAT IS RECORDED
----------------

- Both games' per-frame positions and stances while you play.
- Your controller inputs, as a text script (so we can replay your session on our side).
- The video clips you record (only while Record is on).
- Your PC's hardware names (Windows version, processor, memory, graphics card) and the emulator's own log.
- The notes you type into the page.


WHAT IS NEVER READ OR SENT
--------------------------

- Your disc image and your BIOS are NEVER copied into the Save file and NEVER sent anywhere. The harness reads the
  image only to prepare the maps inside this folder, and copies the BIOS only into this folder's own emulator.
- Nothing outside this folder is read, apart from your hardware names above.
- NOTHING leaves your PC on its own: the harness works offline (its pages are served from your own PC only, and the
  emulator's network adapter is off). You send the Save file yourself.


LICENCES
--------

- PCSX2 (the emulator, in pack\run\pcsx2): GPL v3. Source: https://github.com/PCSX2/pcsx2
- ffmpeg (the video recorder, pack\runtime\ffmpeg.exe): a GPL build from gyan.dev (https://www.gyan.dev/ffmpeg/builds/);
  its licence text is beside it when it is shipped.
- Node.js (pack\runtime\node.exe): MIT licence (https://nodejs.org).
- Playwright (pack\harness\node_modules): Apache-2.0 licence (https://github.com/microsoft/playwright).
- The DNAS-bypass patch in PCSX2's patches and cheats folders: by Harry62.
- The memory cards carry PSRewired's r0004 update package for SOCOM II.
- SOCOM U.S. Navy SEALs II is Sony's. This harness ships no part of the game disc: you supply your own disc image;
  {{BIOS_SHIPPED}}.

{{PACK_NAME}} / {{PAGE_TAG}} / {{STAMP}}
