let x = global.__abstract ? __abstract("boolean", "true") : true;
let y = global.__abstract ? __abstract("boolean", "false") : false;

var z;
if (x) {
  if (!y) {
  } else throw new Error("x is true");
  z = 1;
} else {
  if (!y) {
  } else throw new Error("x is false");
  z = 2;
}

inspect = function() {
  return z;
};
