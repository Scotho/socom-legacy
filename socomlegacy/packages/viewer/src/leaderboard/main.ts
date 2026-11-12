/**
 * LCM-11b: the `/leaderboard` document's entry (`leaderboard/index.html`): mounts the page (`./leaderboardPage`) on the
 * design system. LCM-16: the page sits in the project site's shell, so the site's stylesheet comes first and the page's
 * own (`./leaderboard.css`) places what is the leaderboard's alone. A browser adaptation (product track, OT.R53): nothing
 * here is a menu place.
 */
import '../projectSite/site.css';
import './leaderboard.css';
import { leaderboardPage } from './leaderboardPage';

document.querySelector('#leaderboard')!.replaceChildren(leaderboardPage());
