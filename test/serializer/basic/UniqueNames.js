(function() {
  function bar() {
    try {
      return global._0.name;
    } catch (e) {
      return "exception";
    }
  }
  inspect = function() {
    return bar();
  };
})();
