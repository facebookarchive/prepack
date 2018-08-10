var FooPrototype = global.__abstract
  ? __abstract("object", "({ get legacyCache() { return this._cache || (this._cache = {}); } })")
  : {
      get legacyCache() {
        return this._cache || (this._cache = {});
      },
    };
function Foo() {}
Foo.prototype = FooPrototype;

function fn() {
  var Bar = new Foo();
  Object.defineProperty(Bar, "_cache", {
    writable: true,
    value: undefined,
  });
  Object.defineProperty(Bar, "cache", {
    get() {
      return this._cache || (this._cache = {});
    },
  });
  return [Bar.legacyCache, Bar.cache];
}

global.fn = fn;
if (global.__optimize) {
  __optimize(fn);
}

inspect = function() {
  let [cache1, cache2] = fn();
  return cache1 === cache2;
};
