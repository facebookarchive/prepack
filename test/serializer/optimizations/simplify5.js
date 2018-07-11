let n = global.__abstract ? __abstract("number", "1") : 1;
let o = global.__abstract ? __abstract("object", "({})") : {};
let opt = n ? o : undefined;

var x, y, z;
x = !!n;
y = opt !== undefined;

if (!!n) {
  z = n ? 10 : 20;
}

inspect = function() {
  return "" + x + " " + y + " " + z;
};
