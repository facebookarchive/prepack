// Verify only one copy of initialized scope values are generated.
// Copies of 13:1
(function() {
  let x = 13,
    y = 35;
  let f = function() {
    x += 3;
    y -= 39;
    return x + y;
  };
  let g = function() {
    x -= 2;
    y += 19;
    return x + y;
  };
  inspect = function() {
    return f() + g() + f();
  };
})();
