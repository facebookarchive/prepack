function fn(secondaryPattern, replaceWith, wholeNumber) {
  var replaced;
  while ((replaced = wholeNumber.replace(secondaryPattern, replaceWith)) != wholeNumber) {
    wholeNumber = replaced;
  }
  return wholeNumber;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn("1", "2", "121341");
};
