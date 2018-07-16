var FooPrototype = global.__abstract
  ? __abstract("object", "({ get name() { return this._name; } })")
  : {
      get name() {
        return this._name;
      },
    };
function Foo(name) {
  // Field initializer
  Object.defineProperty(this, "_name", {
    writable: true,
    value: name,
  });
}
Foo.prototype = FooPrototype;

function fn() {
  var Bar = new Foo("Sebastian");
  Object.defineProperty(Bar, "setName", {
    value: function(name) {
      return (this._name = name);
    },
  });
  var name = Bar.name;
  Bar.setName("Nikolai");
  return name;
}

global.fn = fn;
if (global.__optimize) {
  __optimize(fn);
}

inspect = function() {
  return fn();
};
