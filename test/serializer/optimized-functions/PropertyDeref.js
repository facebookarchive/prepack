function fn(arg) {
  return arg != null && arg.x && arg.y; // needs both conjunctions to repro. Happens because of scope promotion
};

if (global.__optimize) __optimize(fn);

inspect = function() {
  return JSON.stringify([
    fn(null),
    fn(undefined),
    fn({x: false, y: 5}),
    fn({x: 5, y: 10}),
  ])
}
