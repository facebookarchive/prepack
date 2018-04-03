// does not contain:1 + 3
// This seems to represent the issue outlined in #1620.
// skip this test for now
// (It fails because 1 + 2 not (yet) getting optimized, as nested calls to __optimize seem to just get ignored?)

(function() {
    function f(props) {
        function bar() {
            return props.foo + (1 + 3);
        }
        if (global.__optimize) __optimize(bar);
        return [bar, props.text];
    }
    if (global.__optimize) __optimize(f);

    global.inspect = function() { 
        var a = f({foo: 23, text: "42"});
        return a[0]() + "-" + a[1];
    }
})();
