// does contain:keep me
(function() {
    let f = function() { /* keep me */ };
    setTimeout(f, 1000);
    setInterval(f, 1000);
    inspect = function() { return true; }
})();