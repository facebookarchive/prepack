// expected errors: [{"location":{"start":{"line":5,"column":14},"end":{"line":5,"column":16},"identifierName":"ob","source":"test/error-handler/forOfStatement.js"},"severity":"FatalError","errorCode":"PP0014"}]

let ob = global.__abstract ? __abstract("object", "([1, 2, 3])") : [1, 2, 3];

for (let p of ob) {
}
