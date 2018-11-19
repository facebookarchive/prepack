let b = global.__abstract ? __abstract("boolean", "false") : false;
let ob1 = b ? undefined : { foo: 42 };
let ob2 = b ? null : { foo: 24 };

var x, y;
if (undefined === ob1 || ob2 === null) x = "no can do";
else {
  x = ob1.foo;
  y = ob2.foo;
}

inspect = function() {
  return x + " " + y;
};
