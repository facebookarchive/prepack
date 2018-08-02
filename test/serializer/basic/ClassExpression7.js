global.C = class {};
global.C.prototype.foo = 42;

inspect = function() {
  return JSON.stringify(global.C);
};
