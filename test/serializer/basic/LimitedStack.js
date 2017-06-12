// limit stack depth: 100
// exceeds stack depth limit

(function() {
  let immediate = function(future) {
    if (Date.now() > future) {
      return "exit value";
    }

    return immediate(future);
  };

  let n = immediate(Date.now() - 1);
})();

inspect = function() {
  return false;
};
