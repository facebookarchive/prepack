(function() {
  var vString = new String("foo");
  var vBoolean = new Boolean(true);
  var vNumber = new Number(123);
  var vRegExp = new RegExp("x", "g");
  var vFunction = function() {
    return 42;
  };
  var a = [vString, vBoolean, vNumber, vRegExp, vFunction];
  inspect = function() {
    function describe(v) {
      if (v instanceof RegExp) return v.source;
      if (v instanceof Function) return v();
      return v;
    }
    return a.map(v => v.constructor.name + ":" + describe(v)).join(", ");
  };
})();
