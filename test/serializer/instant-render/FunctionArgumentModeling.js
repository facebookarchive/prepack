// instant render
// add at runtime: var __prop_int, __prop_string_list, __prop_string; __prop_int = __prop_string_list = __prop_string = ((o, k) => o[k]);
// does not contain: "userProfile"
// does contain: "name"
// does contain: "friendlyNames"
// does not contain: "0"
// does contain: "age"
// does contain: __prop_string
// does contain: __prop_int
// does contain: __prop_string_list
// does not contain: __prop_tree
// does not contain: __prop_tree_list
// does not contain: "102"
// does not contain: "width"
// does not contain: "height"
// does contain: "TypecheckOpt"
// does contain: "TypecheckNumbernumber"

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
            props.userProfile.friendlyName[0],
            props.userProfile.age,
            props.screenSize.width,
            props.screenSize.height,
            'TypecheckOpt' + typeof props.screenSize,
            'TypecheckNumber' + typeof props.screenSize.width,
        ];
    }
    if (global.__optimize) {
        __optimize(toBeOptimized, JSON.stringify(toBeOptimizedModel));
    }

    global.target = toBeOptimized;
    global.inspect = () => true;
})();