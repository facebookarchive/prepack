// Copies of String: 1
// omit invariants
(function() {
  let indexOf = String.prototype.indexOf;
  let substr = String.prototype.substr;
  inspect = function() {
    return indexOf.name + substr.name;
  };
})();
