(function() {
  function outer() {
    let x = {};
    function middle() {
      function inner() {
        return x;
      }
      if (global.__optimize) __optimize(inner);
      return inner;
    }
    if (global.__optimize) __optimize(middle);
    return middle;
  }
  if (global.__optimize) __optimize(outer);
  global.inspect = function() {
    return outer()()() === outer()()();
  };
})();
