var cache = {};

function additional1(x, y) {
    if (!cache[x]) {
        cache[x] = y;
    }
    return cache[x];
}

if (global.__optimize)
    __optimize(additional1);

inspect = function inspect() {
    return additional1("a", 5);
}
