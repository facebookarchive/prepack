function fn(resolve) {
  setTimeout(function() {
    resolve();
  }, 100);
}

inspect = function() {
  return new Promise(fn);
};
