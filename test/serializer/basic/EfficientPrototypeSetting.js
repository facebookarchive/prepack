// does not contain:__proto__ =
(function() {
  var x = { x: 1 };
  var proto = { p: 2 };
  x.__proto__ = proto;
  inspect = function() {
    let p = Object.getPrototypeOf(x);
    return p === proto;
  };
})();
