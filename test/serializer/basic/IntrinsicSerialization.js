(function() {
  let old = Array.prototype.forEach;
  Array.prototype.forEach = function() {};
  Array.prototype.forEach = old;
  inspect = function() {
    return Array.prototype.forEach.name;
  };
})();
