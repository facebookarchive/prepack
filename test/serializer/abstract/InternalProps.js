let x = global.__abstract ? __abstract("boolean", "true") : true;

let ob = {};
if (!x) {
  Object.setPrototypeOf(ob, { a: 1 });
} else {
  Object.setPrototypeOf(ob, { a: 2 });
}

var z = ob.a;

inspect = function() {
  return z;
};
