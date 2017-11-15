// add at runtime:global.ob = { foo: { a: { toString: function() { return "foo.a"; }} }, bar: { b: {} } };
if (global.__abstract) {
  __assumeDataProperty(this, "ob", __abstract({
    foo: __abstract({ a: __abstractOrUndefined({}) }),
    bar: __abstract({ b: __abstractOrNullOrUndefined({}) }),
  }));
}

let x = ob.foo.a;
let y = ob.bar.b;

let x2;
if (x !== undefined) {
  x2 = !x ? 1 : 2;
}

inspect = function() { return x === y && x2 === 2; }
