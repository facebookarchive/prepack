// es6
let x = global.__abstract ? __abstract("boolean", "true") : true;
let foo = { x: "yz" };
let bar1 = { y: 1 };
let bar2 = { y: 2 };

let wm = new WeakMap();

if (x) wm.set(foo, bar1);
else wm.set(foo, bar2);

var x1 = wm.get(foo);
var x2 = wm.has(foo);
var x3 = wm.has(bar1);
var x4 = wm.delete(foo);
var x5 = wm.has(foo);
var x6 = wm.get(foo);
var x7 = x ? wm.set(bar1, foo) : wm.set(bar2, foo);
// The code below does not currently work but could be made to work with a bit more effort. See #1047.
// x8 = wm.delete(bar1);

inspect = function() {
  return JSON.stringify([x1, x2, x3, x4, x5, x6, x7, "x8"]);
};
