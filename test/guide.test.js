// The in-app guide must be revised with every version bump: its version has to equal package.json.
global.window = {}; global.self = global.window;
require('../src/js/guide.js');
const pkg = require('../package.json');
const G = global.window.WA.GUIDE;
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name, extra); if (!ok) fails++; };
check(`guide version matches package.json (${pkg.version})`, G.version === pkg.version, `guide=${G.version}`);
check('guide has EN and UK sections of equal length', G.en.length === G.uk.length && G.en.length >= 8, `${G.en.length}/${G.uk.length}`);
check('section ids match between languages', G.en.every((s, i) => s.id === G.uk[i].id));
check("What's new mentions the current version", G.en.find((s) => s.id === 'whatsnew').body.includes(pkg.version) && G.uk.find((s) => s.id === 'whatsnew').body.includes(pkg.version));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
