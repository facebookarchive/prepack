// expected errors: [{"severity":"Warning","errorCode":"PP1007","callStack":"Error\n    "},{"location":{"start":{"line":5,"column":16},"end":{"line":5,"column":18},"source":"test/error-handler/ModifiedObjectPropertyLimitation.js"},"severity":"Warning","errorCode":"PP0023","callStack":"Error\n    "},{"location":{"start":{"line":5,"column":16},"end":{"line":5,"column":18},"source":"test/error-handler/ModifiedObjectPropertyLimitation.js"},"severity":"FatalError","errorCode":"PP1006","callStack":"Error\n    "}]
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
