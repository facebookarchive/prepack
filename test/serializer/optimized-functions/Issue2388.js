var foo;
(function() {
  function f() {
    let x = 23;
    function g() {
      x = x + 1;
      // x doesn't leak here
    }
    function h(gg) {
      function hh() {
        x = x + 1;
      }
      gg(hh); // leaks x
    }
    global.__optimize && __optimize(g);
    global.__optimize && __optimize(h);
    return [g, h];
  }
  global.__optimize && __optimize(f);
  foo = f;
})();

global.inspect = function() {
  let [g, h] = foo();
  return h(g);
};
