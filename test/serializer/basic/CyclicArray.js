var a = [0, 1, 2, 3, 4];
a[2] = a;

inspect = function() {
  return a[2][2][2][2][2][4];
};
