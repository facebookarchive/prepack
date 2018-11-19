// does not contain:456
let x = global.__abstract ? __abstract("boolean", "true") : true;

let ob = {};
if (x) {
  ob.x = 123;
} else {
  ob.x = 456;
}
if (x) {
  var y = ob;
}

inspect = function() {
  return y;
};
