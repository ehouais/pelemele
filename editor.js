require.config({paths: {
    core        : 'https://raw.github.com/ehouais/jsutils/master/src/core',
    observable  : 'https://raw.github.com/ehouais/jsutils/master/src/observable',
    factory     : 'https://raw.github.com/ehouais/jsutils/master/src/factory',
    fsm         : 'https://raw.github.com/ehouais/jsutils/master/src/fsm',
    datastores  : 'https://raw.github.com/ehouais/jsutils/master/src/datastores'
}});
require(['jquery', 'pelemele.js', 'core', 'observable', 'datastores', 'fsm'], function($, Pelemele, core, observable, Datastores, FSM) {
    $(function() {
        var pm; // Pelemele instance
        var $container = $('#editor');
        var view = Pelemele.View({container: $container});
        var controller = Pelemele.Controller({container: $container, gridstep: 4});
        var viewpm = function(data) {
            pm = Pelemele.create(data);
            view.set(pm);
        };
        var editpm = function(data) {
            pm = Pelemele.create(data);
            pm.bind('modified', function() { appstate.transition('modify') });
            view.set(pm);
            controller.set(pm);
        };

        // init and bind properties editor -------------------------
        var propsEditor = (function PropsEditor() {
            // init modal window
            var $modal = $('#modal');
            $modal.modal({backdrop: false, show: false});

            // bind save handler
            $('#modal_save').on('click', function save() {
                var props = {};
                $modal.find('.form-group:not(.hidden) .form-control').each(function() {
                    props[$(this).attr('id').substr(5)] = $(this).val();
                });
                ed.trigger('saved', [props]);
            });

            // hide editor when editing's done
            $('#modal_cancel, #modal_save').on('click', function() {
                $modal.modal('hide');
            });

            // show delete button if necessary
            /*if (ondelete) {
                $('#modal_delete').off('click').on('click', function() {
                    ondelete();
                    $modal.modal('hide');
                }).show();
            } else {
                $('#modal_delete').hide();
            }*/

            var ed = observable();
            ed.set = function(title, props) {
                props = props || {};

                // set title
                $modal.find('.modal-title').text(title);
                
                // set fields initial value and show only relevants fields
                $modal.find('.form-group').addClass('hidden');
                for (var prop in props) {
                    $modal.find('#fg_'+prop).removeClass('hidden').find('.form-control').val(props[prop]);
                }

                // show modal
                $modal.modal('show');
            };
            return ed;
        })();

        controller.bind('doubleclicked', function(e, frame) {
            propsEditor.unbind('saved').bind('saved', function(e, props) {
                frame.data().set(props);
            });
            propsEditor.set('Edit '+frame.template_id(), frame.data().snapshot());
        });

        // init retractable menu -----------------------------------
        var menu = (function() {
            // menu bar
            var tid;
            var $menu = $('#menu')
            .on('mouseleave', function() {
                tid = setTimeout(function() {
                    rearm();
                }, 500);
            })
            .on('mouseenter', function() {
                clearTimeout(tid);
            });

            var show = function() { $menu.addClass('open') },
                hide = function() { $menu.removeClass('open') },
                rearm = function() {
                    hide();
                    $('#menumask').on('mouseenter', function(e) {
                        show();
                    });
                };
            rearm();

            // hide 
            $('.edit').hide();

            var mn = observable();
            mn.show = show;
            mn.hide = hide;

            return mn;
        })();

        // init menu buttons ---------------------------------------
        $('#new, #clone, #home, #save, #cancel, #publish, #palette button').on('focus', function() {
            $(this).blur();
        });

        var create_frame = function(w, h, template_id, data) {
            pm.frames().add(function(frame) {
                var cx = $container.width()/2, cy = $container.height()/2;
                frame.left().type(Pelemele.HA.left).value(cx-w/2);
                frame.right().type(Pelemele.HA.left).value(cx+w/2);
                frame.top().type(Pelemele.VA.top).value(cy-h/2);
                frame.bottom().type(Pelemele.VA.top).value(cy+h/2);
                frame.template_id(template_id);
                frame.data().set(data);
                controller.trigger('doubleclicked', [frame]);
                return frame;
            });
        };
        $('#palette button[data-action=iframe]').on('click', function() { create_frame(300, 300, 'iframe', {uri: ''}) });
        $('#palette button[data-action=image]').on('click', function() { create_frame(200, 200, 'image', {uri: '', title: '', link: ''}) });
        $('#palette button[data-action=label]').on('click', function() { create_frame(200, 50, 'flabel', {title: '', link: ''}) });
        $('#palette button[data-action=text]').on('click', function() { create_frame(300, 400, 'text', {text: ''}) });
        //$('#palette button[data-action=shape]').on('click', function() { create_frame() });

        $('#new').on('click', function() {
            editpm();
        });
        $('#clone').on('click', function() {
            // get data for current pelemele & create new private pelemele with them
            // TODO
        });
        $('#home').on('click', function() {
            // redirect to base URL
            home();
        });
        $('#save').on('click', function() {
            if (store && store.save) {
                store.save(id, pm.snapshot()).done(function() {
                    appstate.transition('save');
                });
            } else {
                // let user choose store
                // create new entry in store
                // get new entry's id
                // redirect to proper URL
                // TODO
            }
        });
        $('#cancel').on('click', function() {
            // re-fetch data for current URI or init pelemele (new)
            // TODO
            appstate.transition('cancel');
        });
        $('#publish').on('click', function() {
            // create public version of current pelemele
            // TODO
            appstate.transition('publish');
        });

        // application state machine encapsulation -----------------
        // init application state machine
        var appstate = FSM({
            start: {
                state: {isnew: false, ismodified: false, isediting: false},
                transitions: {loadpublic: 'public', loadprivate: 'private'}
            },
            public: {
                state: {isnew: false, ismodified: false, isediting: false},
                transitions: {new_: 'new_', clone: 'private', load: 'private'}
            },
            new_: {
                state: {isnew: true, ismodified: false, isediting: true},
                transitions: {modify: 'newmodified', home: 'public'}
            },
            newmodified: {
                state: {isnew: true, ismodified: true, isediting: true},
                transitions: {cancel: 'new_', modify: 'newmodified', save: 'private'}
            },
            private: {
                state: {isnew: false, ismodified: false, isediting: true},
                transitions: {modify: 'privatemodified', publish: 'public'}
            },
            privatemodified: {
                state: {isnew: false, ismodified: true, isediting: true},
                transitions: {cancel: 'private', modify: 'privatemodified', save: 'private'}
            }
        }, 'start');

        // handle transitions
        appstate.bind('changed', function(e, id, state) {
            $('#new').toggle(!state.isediting);
            $('#clone').toggle(!state.isediting);
            $('#home').toggle(state.isediting && !state.ismodified);
            controller[state.isediting ? 'enable' : 'disable']();
            $('#save').toggle(state.isediting && state.ismodified);
            $('#cancel').toggle(state.isediting && state.ismodified);
            $('#palette').toggle(state.isediting);
            $('#publish').toggle(!state.isnew && !state.ismodified);
        });

        // extract data source information from URL ----------------
        var parser = document.createElement('a'),
            parts, store, id;
            home = function() {
                window.location.href = parser.protocol+'//'+parser.host+parser.pathname;
            };
        parser.href = window.location.href;
        if (!parser.search) {
            //store = {load: function(id) { return $.getJSON(id) }};
            //id = 'homepage.json';
            store = Datastores.http({collection: 'http://data.ehouais.net/pelemele', auth: true});
            id = 'http://data.ehouais.net/pelemele/homepage';
        } else if (parts = parser.search.match(/\?id=local\-(.+)/)) {
            store = Datastores.local({prefix: 'pelemele'});
            id = parts[1];
        } else if (parts = parser.search.match(/\?id=ehouais\-(.+)/)) {
            store = Datastores.http({collection: 'http://data.ehouais.net/pelemele', auth: true});
            id = 'http://data.ehouais.net/pelemele/'+parts[1];
        } else if (parts = parser.search.match(/\?id=gss\-(.+)/)) {
            store = Datastores.gss({simpleSheet: true}),
            id = parts[1];
        } else {
            // invalid URL => redirect to home page
            home();
        }

        // load data and init editor -------------------------------
        store.load(id).done(function(data) {
            // check if pelemele is editable ?
            // TODO
            if (false/* public */) {
                appstate.transition('loadpublic');
                viewpm(data);
            } else {
                appstate.transition('loadprivate');
                editpm(data);
            }
        }).fail(function() {
            // unable to load pelemele => redirect to home page
            home();
        });

        // other not fully implemented functions -------------------
        return;
        /*
        // browser history management
        $(window).bind('popstate', function(event) {
            console.log('pop: ' + event.state);
            appstate.init(event.state);
        });

        // drag 'n drop management
        var noop = function(e) {
            e.stopPropagation();
            e.preventDefault();
        };
        $dom.on({
            'dragstart dragenter dragleave dragover dragend drop': noop,
            'drop': function(e) {
                noop(e);
                var link = e.originalEvent.dataTransfer.getData('text/uri-list');
                view.frames().add({
                    left: {type: HA.prop, value: 0.45},
                    top: {type: VA.prop, value: 0.45},
                    right: {type: HA.prop, value: 0.55},
                    bottom: {type: VA.prop, value: 0.55},
                    template_id: 'iframe',
                    data: {uri: 'http://crobs-server.philou.c9.io/g2697972'}
                });
            }
        });

        // selection management
        (function() {
            var selected;
            $overlay.on('click', function(e) {
                if (selected) {
                    $(selected).removeClass('selected');
                }
                if (e.target == $overlay.get(0)) {
                    selected = null;
                } else {
                    selected = e.target;
                    $(selected).addClass('selected');
                }
            });
        })();
        */
    });
});
