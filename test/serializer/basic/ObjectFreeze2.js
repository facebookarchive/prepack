// does contain:freeze
// does not contain:defineProperty
(function() {
  var f = function() {};
  Object.freeze(f);
  global.inspect = function() {
    f.z = "bug";
    return f.z;
  };
})();
