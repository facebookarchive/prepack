// Copies of String: 1
(function() {
    let indexOf = String.prototype.indexOf;
    let substr = String.prototype.substr;
    inspect = function() { return indexOf.name + substr.name; }
})();
