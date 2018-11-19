// omit invariants
// does not contain:Unknown scope selector
(function() {
  var x = 2;
  var y = 2;
  function getAnswer() {
    return x + y;
  }
  function setX(newX) {
    x = newX;
  }
  global.getAnswer = getAnswer;
  global.setX = setX;
})();
