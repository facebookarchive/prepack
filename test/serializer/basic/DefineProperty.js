// Copies of enumerable:1
(function() {
  var obj = {};
  Object.defineProperty(global, "a", { enumerable: false, configurable: false, writable: true, value: 42 });
  Object.defineProperty(global, "b", { enumerable: false, configurable: false, writable: true, value: 23 });
  inspect = function() {
    return global.a + global.b;
  };
})();
