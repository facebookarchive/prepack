// Copies of enumerable:2

(function() {
  global.obj = 13;
  Object.defineProperty(global, "obj", { enumerable: false, configurable: true, writable: true, value: 42 });
  Object.defineProperty(global, "obj", { enumerable: true, configurable: true, writable: true, value: 23 });
  inspect = function() {
    return JSON.stringify(Object.getOwnPropertyDescriptor(global, "obj"));
  };
})();
