(function() {
  var x = {};
  x.__proto__ = 42;
  inspect = function() {
    return x.__proto__;
  };
})();
