(function() {
  let re = RegExp;
  RegExp = function() {
    throw new Error();
  };
  RegExp = new re("ab+c");
})();

inspect = function() {
  return RegExp;
};
