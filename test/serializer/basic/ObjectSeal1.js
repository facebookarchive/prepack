// does contain:seal
// does not contain:defineProperty
(function() {
  var o = { x: 23, y: 42 };
  Object.seal(o);
  global.inspect = function() {
    o.z = "bug";
    return o.z;
  };
})();
