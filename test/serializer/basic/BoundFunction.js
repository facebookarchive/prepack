var o = { x: 42 };
o.f = function() {
  return this.x;
}.bind(o);

inspect = function() {
  return o.f();
};
