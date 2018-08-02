// does contain:freeze
// does not contain:defineProperty
(function() {
  var a = [1, 2, 3];
  Object.freeze(a);
  global.inspect = function() {
    a.z = "bug";
    return a.z;
  };
})();
