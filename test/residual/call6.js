eval("var ohSo = 'evil';");
evil = eval();
eval = function() {
  return " very ";
};
very = eval();
__result = ohSo + very + evil;
