// add at runtime:global.ob = { foo: { a: { toString: function() { return "foo.a"; }} }, bar: { b: {} } };
// does not contain:1 : 2
if (global.__abstract) {
  __assumeDataProperty(
    this,
    "ob",
    __abstract({
      foo: __abstract({ a: __abstractOrUndefined({}) }),
      bar: __abstract({ b: __abstractOrNullOrUndefined({}) }),
    })
  );
}

let x = ob.foo.a;
let y = ob.bar.b;

let x2;
if (x !== undefined) {
  x2 = !x ? 1 : 2; // if x is properly a union of undefined and object, then !x should be false here
}

inspect = function() {
  return x === y && x2 === 2;
};
