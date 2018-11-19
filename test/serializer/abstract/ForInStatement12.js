// add at runtime:let tmp = { w: undefined, nest: { x: 1 } };
let str = "({ w: undefined, nest: { x: 1 } })";
let ob = global.__abstract ? __abstract({ w: undefined, nest: __abstract({ x: 1 }) }, "tmp") : tmp;

let tgt = {};

ob = JSON.parse(JSON.stringify(ob));
let loc = ob.nest;
ob.w = {
  a: loc.x / loc.x,
  b: loc.x + loc.x,
};
for (var p in ob) {
  tgt[p] = ob[p];
}
let final_p1 = tgt.w;
let finalv = final_p1.a;

inspect = function() {
  return finalv + tgt.w.a + tgt.w.b;
};
