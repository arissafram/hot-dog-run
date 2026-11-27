// The vendored Phaser build, bundled into the package without touching window.Phaser.
import { saved } from './phaser-before.js';
import Phaser from '../vendor/phaser.min.js';

if (saved.had) globalThis.Phaser = saved.value;
else delete globalThis.Phaser;

export default Phaser;
