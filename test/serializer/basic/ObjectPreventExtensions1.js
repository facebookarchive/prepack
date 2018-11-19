// does contain:preventExtensions
// does not contain:defineProperty
(function() {
  var o = { x: 23, y: 42 };
  Object.preventExtensions(o);
  global.inspect = function() {
    o.z = "bug";
    return o.z;
  };
})();
