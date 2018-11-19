// add at runtime:var c=true;
let c = global.__abstract ? __abstract("boolean", "c") : true;
let s = NaN;
let u = c ? s : 42;
let v = c ? 43 : s;

inspect = function() {
  return u + " " + v;
};
