// throws introspection error

function foo(){};
Object.defineProperty(foo, Symbol.hasInstance, { value: function() { throw 123; } })
var f = global.__abstract ? __abstract(foo, "foo") : foo;
var o = global.__abstract ? __abstract({}, "({})") : {};

try {
  x1 = o instanceof f;
} catch (err) {
  x1 = err;
}

inspect = function() { return "" + x1; }
