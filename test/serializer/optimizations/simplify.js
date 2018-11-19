let b = global.__abstract ? __abstract("boolean", "true") : true;
let ob1 = b ? { foo: 42 } : undefined;
let ob2 = b ? { foo: 24 } : null;

var x = "no can do";
var y;
if (ob1 == null || undefined == ob2) x = "no can do";
else {
  x = ob1.foo;
  y = ob2.foo;
}
if (ob1 != null) {
  x = ob1.foo;
}
if (null == ob1) {
  x = "no can do";
}

inspect = function() {
  return x + " " + y;
};
