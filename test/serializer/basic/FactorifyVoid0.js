// skip lazy objects
// Copies of void 0:1
// do not inline expressions
// omit invariants
(function() {
  a = { x: 1, y: undefined };
  b = { x: 1, y: undefined };
  c = { x: 1, y: undefined };
  d = { x: 1, y: undefined };
  e = { x: 1, y: undefined };
  inspect = function() {
    global.a.x + global.b.x + global.c.x + global.d.x + global.e.x;
  };
})();
