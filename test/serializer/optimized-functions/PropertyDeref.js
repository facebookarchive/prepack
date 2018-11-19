function fn(arg) {
  return arg != null && arg.x && arg.y;
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return JSON.stringify([fn(null), fn(undefined), fn({ x: false, y: 5 }), fn({ x: 5, y: 10 })]);
};
