(function() {
  function fn() {
    var arr = [0];
    for (var i = 0; i < arr.length; i++) {
      break;
    }
    return 10;
  }

  if (global.__optimize) {
    __optimize(fn);
  }

  global.inspect = function() {
    return fn();
  };
})();
