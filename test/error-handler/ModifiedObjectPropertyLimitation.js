// recover-from-errors
// expected errors: [{"severity":"Warning","errorCode":"PP0023","callStack":"Error\n    "}]
(function() {
  let p = {};
  function f(c) {
    let o = {};
    if (c) {
      o.__proto__ = p;
      throw o;
    }
  }
  if (global.__optimize) __optimize(f);
  inspect = function() {
    try {
      f(true);
    } catch (e) {
      return e.$Prototype === p;
    }
  };
})();
