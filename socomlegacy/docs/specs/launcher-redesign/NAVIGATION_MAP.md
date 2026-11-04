# Launcher navigation map

This is the approved PR #509 structure. The five crossbar categories are tabs of one page, not five independent navigation stacks. A nested page pushes history; changing category, settings tab or focus replaces the current entry. Dialogs close before the page behind them.

```text
Header
  SOCOM II Legacy logo and version
  Discord on desktop
  Account at top right
    Service record
    Replays
    Loadouts
    Profiles
    Sign out, or Sign in when signed out

Crossbar in fixed order
  Experiments
    Forge                         opens separate tab
    Test room                     opens separate tab

  Online
    Browse rooms                  /online/rooms
      Room detail                 /online/rooms/<id>
        Game detail               /online/games/<id>
      Search                      same-page dialog
      Filters and Refresh         remain on the same screen
      Select/clear launch target  page mode only
    Sign in or account status
    Server news                   reading dialog
    Custom matches                /online/custom
      Join                        opens Forge flow; locked over game
    Server                        /online/server
      Refresh
      Report a problem            conditional overlay/local-file dialog

  Home                            initial category
    Disc
      Cog: DISC ISO / RETAIL DISC  source menu
      Native local file/folder picker
      Extraction and verification  progress/recovery dialog
    Controller                    Settings > Controller
    Microphone                    enable/disable optional voice input
    Memory card                   Profile
    Discord                       phone row
    Readiness and server activity right panel

  Settings
    System Settings               /settings/display initially
      Display
      App
      Audio
      Controller
        Button mapping            /settings/controller/mapping
          Controller diagram and binding rows
          Teach unfamiliar layout
          Binding conflict        Swap / Replace / Cancel dialog
          Restore defaults        confirmation
      Mobile                      touch devices only
        Touch layout              separate host editor
      Communication
      Account
    App                           /settings/app
      Install app                 browser-specific dialog
      Remove downloaded content   confirmation
      Interface size
      Scanline overlay
      Backdrop motion

  Profile                         /profile
    Service record                /profile/record
    Replays                       /watch
      More matches / retry
      Watch                       mounted viewer, disc and round gated
        Transport, seek, roster, available cameras, Back
    Loadouts                      /profile/armory
      SEAL                        /profile/armory/seal
        Mission                   /profile/armory/seal/<mission>
      Terrorist                   /profile/armory/terrorist
        Mission                   /profile/armory/terrorist/<mission>
      Save
      Defaults                    confirmation
      Leave dirty edits           confirmation
    Profiles                      /profile/personas
      Persona                     /profile/personas/<id>
        Home town / gender
        Taunts / team messages
        Delete                    confirmation
      New persona                 /profile/personas/new
      Match name                  field dialog
    Sign out                      confirmation, optional forget device
      Sign in replaces this row when signed out

Shared entry dialogs
  Sign in                         persona tiles, Add new, native fields, OSK
  User agreement                  scrollable, Accept / Decline
  Decline agreement               confirmation
  Text field                      native input, cap/error, OSK
  App installation                browser-specific instructions/offer

Page-only launch cluster
  Disc status, device cues, START
  Launch handoff                  progress and error/Back

Companion overlay
  Same categories and supported nested pages
  Back to game
  No START or launch target
  Disc/account/card/round locks
  Does not push browser history
```

The tree documents the source's stable routes. It does not reserve new URLs for the proposed Client/Game settings split, saved-data backup manager, standalone voice test or input diagnostic concept. Share links that enter an actual game lobby belong to the game's routing flow and are not an additional crossbar category.
