// does not contain: ? 10 :

let x = global.__abstract ? __abstract("boolean", "true") : true;
let y;
let z;
if (x) y = 10;
if (x) z = y;
else z = 10;

inspect = function() {
  return z;
};
