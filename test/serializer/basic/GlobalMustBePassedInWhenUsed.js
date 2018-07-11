// does contain:.call(this)
(function() {
  var _$0 = this;

  x = 42;

  function _0() {
    return _$0.x;
  }

  inspect = _0;
}.call(this));
