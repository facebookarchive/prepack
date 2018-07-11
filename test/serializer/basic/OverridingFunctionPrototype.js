(function() {
  function f() {}
  let p = f.prototype;
  f.prototype = {};
  Object.defineProperty(f.prototype, "constructor", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: f,
  });
  inspect = function() {
    return f.prototype === p;
  };
})();
