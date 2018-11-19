// Copies of .assign;:1
global.f = function(x, y) {
  if (y) return Object.assign({}, x);
  else throw new Error();
};

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return global.f({ p: 42 }, true).p;
};
