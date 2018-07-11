(function() {
  global.first = function() {
    // Function ordering: 1
    second();
    return 10;
  };
  var second = function() {
    // Function ordering: 2
    return 20;
  };
  inspect = function() {
    return global.first() + second();
  };
})();
