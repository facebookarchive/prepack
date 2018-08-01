// skip lazy objects
// Copies of void 0:1
// omit invariants
(function() {
  a = { x: 1, y: undefined };
  b = { x: 1, y: undefined };
  c = { x: 1, y: undefined };
  d = { x: 1, y: undefined };
  e = { x: 1, y: undefined };
  // let's make sure we have at least two references to each value, so that they don't get inlined.
  dummy1 = [a, b, c, d, e];
  dummy2 = [a, b, c, d, e];
  inspect = function() {
    global.a.x + global.b.x + global.c.x + global.d.x + global.e.x;
  };
})();
