(function() {
  function f() {
    let obj = { count: 0 };
    return function(reset) {
      if (reset) obj = { count: 0 };
      return obj.count++;
    };
  }
  var g = f();
  inspect = function() {
    return "" + g(false) + g(true) + g(false);
  };
})();
