// cannot serialize
(function() {
  x = new Uint8Array();
  inspect = function() { return x.constructor.name; }
})();

