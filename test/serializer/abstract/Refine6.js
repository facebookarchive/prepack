// does contain: "def" : "ghi1"
// does contain: "abc" : "ghi2"

let x = global.__abstract ? __abstract("boolean", "false") : false;
let ob = x ? { y: "z" } : null;
var z = ob == null ? (ob ? "wrong" : "ok") : "wrong";

let str = x ? "abc" : "def";
var z1 = str !== "abc" ? str : "ghi1";
var z2 = str === "abc" ? str : "ghi2";

inspect = function() {
  return z + z1 + z2;
};
