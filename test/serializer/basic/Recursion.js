var f = function(i) {
  return i > 0 ? f(i - 1) + 1 : 0;
};

inspect = function() {
  return f(42);
};
