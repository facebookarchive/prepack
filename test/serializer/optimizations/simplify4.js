let b = global.__abstract ? __abstract("boolean", "false") : false;
let ob1 = b ? undefined : { foo: 42 };
let ob1a = !b ? { foo: 422 } : undefined;
let ob2 = b ? null : { foo: 24 };
let ob2a = !b ? { foo: 244 } : null;
let ob3 = b ? ob1 : ob2;

var x, y;
x = "no can do";
if (undefined !== ob1) {
  x = ob1.foo;
}
if (undefined !== ob1a) {
  x = ob1a.foo;
}
if (ob1a === undefined) {
  x = "no can do";
}
y = "no can do";
if (ob2 !== null) {
  y = ob2.foo;
}
if (ob2a !== null) {
  y = ob2a.foo;
}
if (ob2a === null) {
  y = "no can do";
}
if (ob3 !== null) {
  y = "no can do";
}

inspect = function() {
  return x + " " + y;
};
