// does contain:freeze
// does not contain:defineProperty
(function() {
  var o = { x: 23, y: 42 };
  Object.freeze(o);
  global.inspect = function() {
    o.z = "bug";
    return o.z;
  };
})();
