// does not contain:__proto__ =
(function() {
    var x = {};
    var proto = {};
    x.__proto__ = proto;
    inspect = function() {
        let p = x.__proto__;
        return p === proto;
    }
})();