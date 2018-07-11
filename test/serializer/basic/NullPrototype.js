(function() {
  var x = {};
  x.__proto__ = null;
  inspect = function() {
    x.__proto__ === null;
  };
})();
