// does not contain:dead
let x = global.__abstract ? __abstract("boolean", "true") : true;

let ob = {};
if (x) {
  ob.x = 123;
} else {
  let nested = { p: "dead" };
  ob.x = { left: nested, right: nested };
}
if (x) {
  var y = ob;
}

inspect = function() {
  return y;
};
