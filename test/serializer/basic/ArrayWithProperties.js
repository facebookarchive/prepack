var a = [1, 2, 3];
a.foo = 42;

// Array.toString() only shows indexed values
inspect = function() {
  return a + " " + a.foo;
};
