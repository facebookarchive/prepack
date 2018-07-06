// instant render
// does contain: "TypecheckOpt"
// does contain: "TypecheckNumbernumber"

function gen_getter(valid) {
    return function (o, k) {
        if (valid.indexOf(k) < 0)
            throw new Error("Wrong getter");
        return o[k];
    }
}

// other getters will be caught by linter
var __prop_int = gen_getter(["age", "width", "height"]);
var __prop_string = gen_getter(["name", "friendlyName"]);
var __prop_string_list = gen_getter(["friendNames"]);

(function () {
    var universe = {
        Profile: {
            kind: 'object',
            jsType: 'object',
            graphQLType: 'ProfileData',
            properties: {
                name: {
                    kind: 'scalar',
                    jsType: 'string',
                    graphQLType: 'String',
                    optional: false
                },
                friendlyName: {
                    kind: 'scalar',
                    jsType: 'string',
                    graphQLType: 'String',
                    optional: true
                },
                age: {
                    kind: 'scalar',
                    jsType: 'integral',
                    graphQLType: 'Int',
                    optional: true
                },
                friendNames: {
                    kind: 'array',
                    jsType: 'array',
                    graphQLType: '[String!]',
                    shape: {
                        kind: 'scalar',
                        jsType: 'string',
                        graphQLType: 'String',
                        optional: false
                    },
                    optional: true
                }
            },
            optional: false,
            readonly: true,
        },
        Props: {
            kind: 'object',
            jsType: 'object',
            properties: {
                userProfile: {
                    kind: 'link',
                    shapeName: 'Profile'
                },
                screenSize: {
                    kind: 'object',
                    jsType: 'object',
                    properties: {
                        width: {
                            kind: 'link',
                            shapeName: 'Size',
                        },
                        height: {
                            kind: 'link',
                            shapeName: 'Size',
                        }
                    },
                    optional: true,
                    readonly: false
                }
            },
            optional: false,
            readonly: false
        },
        Size: {
            kind: 'scalar',
            jsType: 'integral',
            optional: false,
            readonly: false
        }
    };

    var toBeOptimizedModel = {
        arguments: {
            props: 'Props'
        },
        universe
    };

    function toBeOptimized(props) {
        return [
            props.userProfile.name,
            props.userProfile.friendlyName,
            props.userProfile.friendlyName ? props.userProfile.friendlyName[0] : undefined,
            props.userProfile.age,
            props.userProfile.friendNames ? props.userProfile.friendNames[2] : undefined,
            props.screenSize ? props.screenSize.width : undefined,
            props.screenSize ? props.screenSize.height : undefined,
            'TypecheckOpt' + typeof props.screenSize,
            'TypecheckNumber' + typeof props.screenSize.width,
        ];
    }
    if (global.__optimize) {
        __optimize(toBeOptimized, JSON.stringify(toBeOptimizedModel));
    }

    global.inspect = function() {
        var props = {
            userProfile: {
                name: "A",
                friendlyName: undefined,
                age: 10,
                friendNames: ["B", "C", "D"]
            },
            screenSize: {
                width: 10,
                height: 10
            }
        };
        return toBeOptimized(props);
    }
})();
