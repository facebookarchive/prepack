// jsc
(function() {
  let o = {
    encode: function encode(s) {
      return unescape(encodeURI(s));
    },
  };
  inspect = function() {
    return o;
  };
  if (global.__makePartial) {
    __makePartial(global);
  }
})();
