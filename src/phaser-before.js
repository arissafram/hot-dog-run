// Remembers window.Phaser before the bundled Phaser runs (it assigns that global),
// so src/phaser.js can put it back and the package leaks no globals.
export const saved = { had: Object.prototype.hasOwnProperty.call(globalThis, 'Phaser'), value: globalThis.Phaser };
