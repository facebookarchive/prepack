// does contain:freeze
(function() {
  var o = { x: 23, y: 42 };
  Object.defineProperty(o, "foo", { enumerable: false, writable: false, configurable: false, value: 42 });
  Object.freeze(o);
  global.inspect = function() {
    o.z = "bug";
    return o.z + Object.getOwnPropertyDescriptor(o, "foo").enumerable;
  };
})();
