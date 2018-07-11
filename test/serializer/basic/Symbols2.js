// es6
(function() {
  let a = Symbol.for("test");
  let b = Symbol.for("test");
  inspect = function() {
    return "" + (a === Symbol.for("test"));
  };
})();
