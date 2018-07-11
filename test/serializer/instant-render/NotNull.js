// instant render
// add at runtime:global.__cannotBecomeObject = a => a === undefined || a === null;
// does not contain:void 0

let a = global.__abstract ? __abstract(undefined, "(true)") : true;

let x1 = a === undefined || a === null;
let x2 = a === undefined || null === a;
let x3 = undefined === a || a === null;
let x4 = undefined === a || null === a;

let x5 = a === null || a === undefined;
let x6 = a === null || undefined === a;
let x7 = null === a || a === undefined;
let x8 = null === a || undefined === a;

global.inspect = function() {
  return [x1, x2, x3, x4, x5, x6, x7, x8].join(" ");
};
