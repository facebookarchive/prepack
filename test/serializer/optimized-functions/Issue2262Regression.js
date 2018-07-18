(function() {
  let p = {};
  function f(c) {
    let o = {};
    if (c) {
      if (global.__makePartial) __makePartial(o);
      throw o;
    }
  }
  if (global.__optimize) __optimize(f);
  inspect = function() {
    try {
      f(true);
      return false;
    } catch (e) {
      return true;
    }
  };
})();
