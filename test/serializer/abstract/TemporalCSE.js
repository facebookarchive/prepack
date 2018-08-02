this.glob = 123;
let b = global.__abstract ? __abstract("boolean", "true") : true;
let y;
if (b) {
  y = glob;
}
let z;
if (b) {
  z = glob;
}

inspect = function() {
  return y + " " + z;
};
