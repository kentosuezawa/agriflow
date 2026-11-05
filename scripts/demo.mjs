import { solve } from '../dist/solve.js';
import { fixture, period } from '../test/fixtures.js';
console.log(JSON.stringify(solve(fixture(), period), null, 2));
