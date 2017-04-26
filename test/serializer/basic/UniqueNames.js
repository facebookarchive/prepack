(function() {
  function bar() {
    try {
      return _0.name;
    } catch(e) {
      return "exception";
    }
  }
  inspect = function() { return bar(); }
})();
