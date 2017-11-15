// skip lazy objects
// Copies of void 0:1
// do not inline expressions
(function() {
    a = { x: 1, y: undefined };
    b = { x: 1, y: undefined };
    c = { x: 1, y: undefined };
    d = { x: 1, y: undefined };
    e = { x: 1, y: undefined };
    inspect = function() { a.x + b.x + c.x + d.x + e.x; }
})();
