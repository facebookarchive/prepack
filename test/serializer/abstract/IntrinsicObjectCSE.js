// add at runtime:global.ob = { foo: { a: {} }, bar: { b: {} } };
if (global.__abstract) {
  __assumeDataProperty(
    this,
    "ob",
    __abstract({
      foo: __abstract({ a: __abstract({}) }),
      bar: __abstract({ b: __abstract({}) }),
    })
  );
}

let x = ob.foo.a;
let y = ob.bar.b;

inspect = function() {
  return x === y;
};
