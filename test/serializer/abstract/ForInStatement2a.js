let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { a: 1 } : { b: 2 };
let src = global.__makePartial ? __makePartial({}) : {};
if (global.__makeSimple) __makeSimple(src);
let tgt = {};
for (var p in ob) {
  tgt[p] = src[p];
}

inspect = function() {
  return tgt.a;
};
