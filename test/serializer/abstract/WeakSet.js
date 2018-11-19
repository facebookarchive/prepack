// es6
let x = global.__abstract ? __abstract("boolean", "true") : true;
let bar0 = { y: 0 };
let bar1 = { y: 1 };
let bar2 = { y: 2 };

let ws = new WeakSet();
var x1 = ws.add(bar0);

if (x) ws.add(bar1);
else ws.add(bar2);

var x2 = ws.has(bar0);
var x3 = ws.delete(bar0);
// The code below does not currently work but could be made to work with a bit more effort. See #1047.
// x4 = ws.has(bar0);
// x5 = ws.delete(bar0);
// x6 = ws.has(bar0);

inspect = function() {
  return JSON.stringify([x1, x2, x3, "x4", "x5", "x6"]);
};
