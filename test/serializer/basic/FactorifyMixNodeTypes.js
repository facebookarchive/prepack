const a = { x: 1, y: 2, z: 3 };
const b = { x: 1, y: 4, z: 5 };
const c = { x: 1, y: 6, z: 7 };
const d = { x: 1, y: 8, z: 9 };
const e = { x: 1, y: 2, z: 10 };

// Hold two references to each object so they are not inlined.
const ref1 = { a, b, c, d };
const ref2 = { a, b, c, d };

global.inspect = () => JSON.stringify({ ref1, ref2, e });
