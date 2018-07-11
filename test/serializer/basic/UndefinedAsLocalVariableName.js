(function() {
  let x = undefined;
  inspect = function() {
    let undefined = 42;
    return undefined === x;
  };
})();
