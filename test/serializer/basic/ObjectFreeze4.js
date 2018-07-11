// does contain:freeze
// does not contain:defineProperty
(function() {
  var re = RegExp();
  Object.freeze(re);
  global.inspect = function() {
    re.z = "bug";
    return re.z;
  };
})();
