# Security

## Reporting

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on this
repository (the Security tab, "Report a vulnerability"). Reports are read; there is no promised response time and no
bounty.

## What is in scope

- The browser client in this repository: anything a hostile server, peer or served file can do to a player's browser
  or machine through it, or anything that running this repository's code or tools does to yours.
- A secret, private address or personal data that reached this repository: report it privately rather than in an
  issue, so it can be removed before it is pointed at.

The match server and the central service are not in this repository; a problem you find in them through the client is
still welcome through the same channel.

## What is not a vulnerability here

- Cheating in a game from 2003 that has no anti-cheat. Reports of cheats are welcome as ordinary bug reports.

## For contributors

No key, token, private address or server credential is ever committed. An example address is taken from RFC 5737
(192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).
