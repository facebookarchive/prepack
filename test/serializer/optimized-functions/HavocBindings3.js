(function() {
  function f(g) {
    let x = 23;
    function f() {
      return x;
    }
    let a = [];
    a.push(g(f));
    x = 42;
    a.push(g(f));
    return a;
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(g => g());
  };
})();
