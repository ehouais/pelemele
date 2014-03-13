define(['jquery', 'core', 'observable', 'factory'], function($, core, observable, factory) {
    // enums
    var pm = {
        HA: {left: 0, prop: 1, right: 2}, // horizontal alignment
        VA: {top: 0, prop: 1, bottom: 2} // vertical alignment
    };

    // model constructor
    pm.create = (function() {
        // factories
        var hcf = factory.object({
                type: {type: [pm.HA.left, pm.HA.prop, pm.HA.right], defval: pm.HA.prop},
                value: {type: 'integer'}
            }),
            vcf = factory.object({
                type: {type: [pm.VA.top, pm.VA.prop, pm.VA.bottom], defval: pm.VA.prop},
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
        return function(data) {
            var instance = pmf(data);
            instance.frames().bind('elementRemoved', function(e, frame) {
                frame.trigger('removed');
            });
            return instance;
        };
    })();

    // view constructor
    // CSS classes: #dom (container), .frame (frame), .link
    pm.View = function(options) {
        options = options || {};
        var $cont = $(options.container);

        // create container and prevent some default behaviours
        var $dom = $('<div/>').attr('id', 'dom').appendTo($cont);
        $dom.on('mousedown mousewheel', function(e) {
            e.preventDefault();
        });

        var addFrame = function(frame) { // create HTML frames for elements already present in pelemele
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
                        //$f.css('font-size', (f.ab()-f.at())/1.3+'px');
                        $f.css('font-size', (f.bottom().value()-f.top().value())/1.3+'px');
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
                //var l = frame.al(), t = frame.at(), w = frame.ar()-l, h = frame.ab()-t;
                var l = frame.left().value(), t = frame.top().value(), w = frame.right().value()-l, h = frame.bottom().value()-t;
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
        return {
            set: function(pm) {
                $dom.empty();
                // model-view bindings
                pm.frames()
                .each(addFrame)
                .bind('elementAdded', function(e, frame) { // create HTML frame when frame is added to pelemele
                    addFrame(frame);
                });
            }
        };
    };

    // controller constructor
    // CSS classes
    pm.Controller = function(options) {
        options = options || {};
        var $cont = $(options.container),
            step = options.gridstep || 4,
            snap = function(coord) { return coord-coord%step };

        // create overlay and prevent some default behaviours
        var $overlay = $('<div/>').attr('id', 'overlay').hide().appendTo($cont).hide();
        $overlay.on('mousedown mousewheel', function(e) {
            e.preventDefault();
        });

        var addmask = function(frame) { // create masks for frames already present in pelemele
            // create mask DOM node
            var $mask = $('<div/>').addClass('mask').appendTo($overlay);
            // handle drag/resize events
            $mask.on('mousedown', function(e) {
                var $mk = $(this).addClass('editing');
                var mx = e.pageX, my = e.pageY;
                //var dx1 = mx-frame.al(), dy1 = my-frame.at();
                var dx1 = mx-frame.left().value(), dy1 = my-frame.top().value();
                //var dx2 = frame.ar()-mx, dy2 = frame.ab()-my;
                var dx2 = frame.right().value()-mx, dy2 = frame.bottom().value()-my;
                var moving = (dx2 > 10 || dy2 > 10);
                var mm = function(e) {
                    mx = e.pageX;
                    my = e.pageY;
                    if (moving) {
                        //frame.al(snap(mx-dx1)).at(snap(my-dy1));
                        frame.left().value(snap(mx-dx1));
                        frame.top().value(snap(my-dy1));
                    }
                    //frame.ar(snap(mx+dx2)).ab(snap(my+dy2));
                    frame.right().value(snap(mx+dx2));
                    frame.bottom().value(snap(my+dy2));
                };
                var mu = function() {
                    $mk.removeClass('editing');
                    $overlay.off('mousemove', mm).off('mouseup', mu);
                };
                $overlay.on('mousemove', mm).on('mouseup', mu);
                e.preventDefault();
            });
            $mask.dblclick(function() {
                co.trigger('doubleclicked', [frame]);
            });
            // bind frame to mask
            var update = function() {
                //var l = frame.al(), t = frame.at(), w = frame.ar()-l, h = frame.ab()-t;
                var l = frame.left().value(), t = frame.top().value(), w = frame.right().value()-l, h = frame.bottom().value()-t;
                $mask.width(w).height(h).css({left: l, top: t});
            };
            frame
            .bind('modified', update)
            .bind('removed', function() {
                $mask.remove();
            });
            update();
        };

        var co = observable();
        co.set = function(pelemele) {
            pelemele.frames()
            .each(addmask)
            .bind('elementAdded', function(e, frame) { // create HTML mask when frame is added to pelemele
                addmask(frame);
            });
        };
        co.enable = function() { $overlay.show() };
        co.disable = function() { $overlay.hide() };

        return co;
    };

    return pm;
});
