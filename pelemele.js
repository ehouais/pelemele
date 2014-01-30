var Pelemele = (function() {
    // inline libs
    var core = (function() {
        var isArray = function(obj) {
            return(obj.constructor.toString().indexOf("Array") != -1);
        };
        var isObject = function(obj) {
            return (obj.constructor == Object);
        };
        var isString = function(obj) {
            return (typeof(obj) == 'string');
        };
        var isFunction = function(obj) {
            var getType = {};
            return obj && getType.toString.call(obj) == '[object Function]';
        };
        var isSet = function(obj) {
            return (typeof obj != 'undefined');
        };
        var extend = function(obj, extObj) {
            if (arguments.length > 2) {
                for (var a = 1; a < arguments.length; a++) { extend(obj, arguments[a]); }
            } else {
                for (var i in extObj) { obj[i] = extObj[i]; }
            }
            return obj;
        };
        var getset = function(getter, setter) {
            return function() {
                return (arguments.length ? setter(arguments[0]) : getter());
            };
        };
        var clone = function(obj) {
            // Handle the 3 simple types, and null or undefined
            if (null === obj || "object" != typeof obj) return obj;
            var copy;
            if (obj instanceof Date) {
                copy = new Date();
                copy.setTime(obj.getTime());
            } else if (obj instanceof Array) {
                copy = [];
                for (var i = 0, len = obj.length; i < len; ++i) {
                    copy[i] = clone(obj[i]);
                }
            } else if (obj instanceof Object) {
                copy = {};
                for (var attr in obj) {
                    if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
                }
            } else {
                throw new Error("Unable to copy obj! Its type isn't supported.");
            }
            return copy;
        };
        return {
            isArray: isArray,
            isObject: isObject,
            isString: isString,
            isFunction: isFunction,
            isSet: isSet,
            extend: extend,
            getset: getset,
            clone: clone
        };
    })();
    var observable = (function(core) {
        return function(props) {
            // Create a RW property whose modification triggers 'modified' event
            var addrwprop = function(obj, key) {
                if (false/*isArray(props[key])*/) {
                    obj[key] = function() {
                        var a = arguments, nb = a.length;
                        if (!nb) {
                            return core.clone(props[key]);
                        } else if (nb == 1) {
                            return props[key][a[0]];
                        } else {
                            props[key][a[0]] = a[1];
                            obj.trigger('modified');
                            return obj;
                        }
                    };
                } else if (false/*isObject(props[key])*/) {
                    if (props[key].bind) {
                        //obj[key] = props[key];
                    }
                } else {
                    obj[key] = core.getset(function() {
                        return props[key];
                    }, function(val) {
                        props[key] = val; // TODO: check if same type
                        obj.trigger('modified');
                        return obj;
                    });
                }
            };
    
            var obj = {}; // Observable object being created
    
            // If props are provided, make each of them a RW observable property
            // and add a [de]serialization methods
            if (props) {
                for (var key in props) { addrwprop(obj, key); }
                obj.serialize = function() { return JSON.stringify(props); };
            }
    
            // Classic 'observable' methods
            var os = {}; // Map of event types and attached observers;
            obj.bind = function(types, o) {
                types.split(' ').forEach(function(type) {
                    if (!os[type]) { os[type] = []; }
                    os[type].push(o);
                });
                return this;
            };
            obj.unbind = function(types, o) {
                types.split(' ').forEach(function(type) {
                    var ost = os[type];
                    if (ost) {
                        var i = ost.indexOf(o);
                        if (i != -1) { ost.splice(i, 1); }
                    }
                });
                return this;
            };
            obj.trigger = function(type, data) {
                data = data || [];
                data.unshift({type: type, target: this});
                var that = this;
                if (os[type]) {
                    os[type].forEach(function(o) { o.apply(that, data); });
                }
                return this;
            };
            obj.unbindAll = function() { os = {}; return this; };
            if (props) { obj.snapshot = function() { return core.clone(props); }; }
    
            return obj;
        };
    })(core);
    var factory = (function(core, observable) {
        return {
            object: function(model) {
                return function(data) {
                    data = data || {};
                    var o = observable();
                    var addProp = function(pn, p) {
                        if (typeof(p.type) == 'string') {
                            if (typeof data[pn] === "undefined") {
                                data[pn] = p.defval;
                            }
                            if (p.access == 'readonly') {
                                o[pn] = function() {
                                    return data[pn];
                                };
                            } else {
                                o[pn] = core.getset(function() {
                                    return data[pn];
                                }, function(val) {
                                    data[pn] = val;
                                    o.trigger('modified');
                                    return o;
                                });
                            }
                        } else if (core.isArray(p.type)) {
                            if (!core.isSet(data[pn]) || p.type.indexOf(data[pn]) == -1) {
                                data[pn] = p.defval;
                            }
                            o[pn] = core.getset(function() {
                                return data[pn];
                            }, function(val) {
                                data[pn] = (p.type.indexOf(val) == -1 ? p.defval : val);
                                o.trigger('modified');
                                return o;
                            });
                        } else {
                            data[pn] = p.type(data[pn]);
                            data[pn].bind('modified', function() {
                                o.trigger('modified');
                            });
                            o[pn] = function() { return data[pn]; };
                        }
                    };
                    for (var pn in model) {
                        addProp(pn, model[pn]);
                    }
                    o.snapshot = function() {
                        var s = {};
                        for (var pn in model) {
                            s[pn] = (typeof(data[pn]) == 'object' ? data[pn].snapshot() : data[pn]);
                        }
                        return s;
                    };
                    o.toString = function() {
                        var s = [];
                        for (var pn in model) {
                            s.push(pn+': '+data[pn]);
                        }
                        return '{'+s.join(', ')+'}';
                    };
                    return o;
                };
            },
            map: function(factory) {
                return function(data) {
                    data = data || {}; // TODO: use safe map, e.g. dict.js
                    var mp = observable();
                    var bind = function(e) {
                        return e.bind('modified', function() { mp.trigger('elementModified', [e]).trigger('modified'); });
                    };
                    mp.has = function(key) {
                        return (key in data);
                    };
                    mp.get = function(key) {
                        return data[key];
                    };
                    mp.set = function() {
                        var args = arguments;
                        if (args.length > 1) {
                            var key = args[0], value = args[1];
                            if (factory) {
                                // value is either snapshot data to use for initialization
                                // or an initialization callback called before any event binding is done
                                value = bind(core.isFunction(value) ? value(factory()) : factory(value));
                            }
                            data[key] = value;
                            mp.trigger('elementAdded', [value]).trigger('modified');
                        } else if (core.isObject(args[0])) {
                            data = args[0];
                            mp.trigger('modified');
                        }
                        return mp;
                    };
                    mp.delete = function(key) {
                        var e = data[key];
                        delete data[key];
                        mp.trigger('elementRemoved', [e]).trigger('modified');
                        return mp;
                    };
                    mp.snapshot = function() {
                        var s = {};
                        for (var key in data) {
                            s[key] = (typeof(data[key]) == 'object' ? data[key].snapshot() : data[key]);
                        }
                        return s;
                    };
                    mp.toString = function() {
                        var s = [];
                        for (var key in data) {
                            s.push(key+': '+data[key]);
                        }
                        return '{'+s.join(', ')+'}';
                    };
                    mp.each = function(cb) {
                        for (var key in data) {
                            cb(key);
                        }
                    };
                    if (factory) {
                        for (var key in data) { 
                            data[key] = bind(factory(data[key]));
                        }
                    }
                    return mp;
                };
            },
            set: function(factory) {
                return function(data) {
                    data = data || [];
                    var st = observable();
                    var bind = function(e) {
                        return e.bind('modified', function() { st.trigger('elementModified', [e]).trigger('modified'); });
                    };
                    st.each = function(cb) {
                        data.forEach(cb, st);
                    };
                    st.add = function(value) {
                        if (factory) {
                            // value is either snapshot data to use for initialization
                            // or an initialization callback called before any event binding is done
                            value = bind(core.isFunction(value) ? value(factory()) : factory(value));
                        }
                        data.push(value);
                        st.trigger('elementAdded', [value]).trigger('modified');
                        return value;
                    };
                    st.remove = function(e) {
                        var pos = data.indexOf(e);
                        if (pos != -1) {
                            data.splice(pos, 1);
                            st.trigger('elementRemoved', [e]).trigger('modified');
                        }
                        return st;
                    };
                    st.snapshot = function() {
                        return data.map(function(e) { return (typeof(e) == 'object' ? e.snapshot() : e); });
                    };
                    st.toString = function() {
                        return '['+(data.map(function(e) { return e.toString(); }) || []).join(', ')+']';
                    };
                    if (factory) {
                        data = data.map(function(e) { return bind(factory(e)); });
                    }
                    return st;
                };
            }
        };
    })(core, observable);

    // enums
    var HA = {left: 0, prop: 1, right: 2}, // horizontal alignment
        VA = {top: 0, prop: 1, bottom: 2}; // vertical alignment

    // factories
    var hcf = factory.object({
            type: {type: [HA.left, HA.prop, HA.right], defval: HA.prop},
            value: {type: 'integer'}
        }),
        vcf = factory.object({
            type: {type: [VA.top, VA.prop, VA.bottom], defval: VA.prop},
            value: {type: 'integer'}
        }),
        ff = factory.object({
            left: {type: hcf},
            top: {type: vcf},
            right: {type: hcf},
            bottom: {type: vcf},
            template_id: {type: 'string'},
            data: {type: factory.map()}
        }),
        pmf = factory.object({
            title: {type: 'string'},
            frames: {type: factory.set(ff)}
        });

    // view
    var view = function(options) {
        options = options || {};
        var pm = options.pelemele || pmf(),
            $cont = $(options.container),
            step = options.gridstep || 4;

        // create container and prevent some default behaviours
        var $dom = $('<div/>').attr('id', 'dom').appendTo($cont);
        $dom.on('mousedown mousewheel', function(e) {
            e.preventDefault();
        });

        // model-view bindings
        var addFrame = function(frame) {
            // add absolute coordinates to frame
            var ahc = function(hc) {
                return core.getset(function() {
                    switch(hc.type()) {
                        case HA.left: return hc.value();
                        case HA.prop: return $dom.width()*hc.value();
                        case HA.right: return $dom.width()-hc.value();
                    }
                }, function(val) {
                    val -= val%step;
                    switch(hc.type()) {
                        case HA.left: hc.value(val); return frame;
                        case HA.prop: hc.value(val/$dom.width()); return frame;
                        case HA.right: hc.value($dom.width()-val); return frame;
                    }
                });
            };
            var avc = function(vc) {
                return core.getset(function() {
                    switch(vc.type()) {
                        case VA.top: return vc.value();
                        case VA.prop: return $dom.height()*vc.value();
                        case VA.bottom: return $dom.height()-vc.value();
                    }
                }, function(val) {
                    val -= val%step;
                    switch(vc.type()) {
                        case VA.top: vc.value(val); return frame;
                        case VA.prop: vc.value(val/$dom.height()); return frame;
                        case VA.bottom: vc.value($dom.height()-val); return frame;
                    }
                });
            };
            core.extend(frame, {
                al: ahc(frame.left()),
                at: avc(frame.top()),
                ar: ahc(frame.right()),
                ab: avc(frame.bottom())
            });

            // create generic DOM node and ad-hoc subnodes
            // TODO: refactor
            var $f = $('<div/>').addClass('frame '+frame.template_id()).appendTo($dom);
            var templates = {
                iframe: function($f, f) {
                    var $i = $('<iframe/>').attr('frameborder', 0).appendTo($f);
                    var update = function() {
                        $i.attr('src', f.data().get('uri'));
                    };
                    f.bind('modified', update);
                    update();
                },
                link: function($f, f) {
                    $f.append($('<a/>').addClass('link').attr({href: f.data().get('uri'), target: '_blank'}).text(f.data().get('title')));
                    f.bottom().value(f.top().value()+16);
                },
                flabel: function($f, f) {
                    var update = function() {
                        $f.text(f.data().get('title'));
                        $f.css('font-size', (f.ab()-f.at())/1.3+'px');
                    };
                    f.bind('modified', update);
                    update();
                },
                image: function($f, f) {
                    var $img = $('<img/>').appendTo($f);
                    var update = function() {
                        $img.attr({src: f.data().get('uri'), title: f.data().get('title')});
                    };
                    f.bind('modified', update);
                    update();
                },
                text: function($f, f) {
                    $t = $('<div/>').appendTo($f);
                    var update = function() {
                        $t.text(f.data().get('text'));
                    };
                    f.bind('modified', update);
                    update();
                }
            };
            templates[frame.template_id()]($f, frame);

            // bindings
            var update = function() {
                var l = frame.al(), t = frame.at(), w = frame.ar()-l, h = frame.ab()-t;
                $f.width(w).height(h).css({left: l, top: t});
            };
            frame
            .bind('modified', update) // update DOM node when frame is modified
            .bind('removed', function() { // remove DOM node when frame is removed
                $f.remove();
            });

            // trigger computation of DOM node initial size and position
            update();
        };
        pm.frames()
        .bind('elementAdded', function(e, frame) { // create HTML frame when frame is added to pelemele
            addFrame(frame);
        })
        .each(function(frame) { // create HTML frames for elements already present in pelemele
            addFrame(frame);
        });
    };

    return {
        HA: HA,
        VA: VA,
        create: function(data) {
            var pm = pmf(data);
            pm.frames().bind('elementRemoved', function(e, frame) {
                frame.trigger('removed');
            });
            return pm;
        },
        view: view
    };
})();
