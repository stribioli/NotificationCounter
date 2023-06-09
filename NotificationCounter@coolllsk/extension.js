
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Lang = imports.lang;
const MessagesIndicator = imports.ui.dateMenu.MessagesIndicator;
const Urgency = imports.ui.messageTray.Urgency;

var MessageCounterIndicator = GObject.registerClass(
class MessageCounterIndicator extends St.Label {
    /*
     * See also ui.dateMenu.MessagesIndicator
     */

    _init() {
        super._init({
            visible: false,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'count-label'
        });

        this._sources = new Map();
        this._signals = [];

        this._connectSignal(Main.messageTray, 'source-added', this._onSourceAdded.bind(this));
        this._connectSignal(Main.messageTray, 'source-removed', this._onSourceRemoved.bind(this));
        this._connectSignal(Main.messageTray, 'queue-changed', this._updateCount.bind(this));

        let sources = Main.messageTray.getSources();
        sources.forEach(Lang.bind(this, function(source) { this._onSourceAdded(null, source); }));

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _onSourceAdded(tray, source) {
        let sourceSignal = source.connect('notify::count', this._updateCount.bind(this));
        this._sources.set(source, sourceSignal);
        this._updateCount();
    }

    _onSourceRemoved(tray, source) {
        source.disconnect(this._sources.get(source));
        this._sources.delete(source);
        this._updateCount();
    }

    _getSources() {
        return [...this._sources.keys()];
    }

    _updateCount() {
        let count = 0;
        let label;
        this._getSources().forEach(Lang.bind(this,
            function(source) {
                for (let i=0; i < source.notifications.length; i++) {
                    let notification = source.notifications[i];
                    if (notification.urgency >= Urgency.NORMAL) {
                        // increment counter
                        count++;
                    }
                }
            }));

        if (count > 10) {
            // Limit count
            count = 10;
        }

        // Create unicode character based on count (➊ .. ➓)
        label = String.fromCharCode(0x2789 + count);
        this.text = label;
        this.visible = (count > 0);
    }

    _connectSignal(target, signal, callback) {
        let s = target.connect(signal, callback);
        this._signals.push([target, s]);
    }

    _onDestroy() {
        this._signals.forEach( (sig) => sig[0].disconnect(sig[1]) );
        this._sources.forEach( (sig, source) => source.disconnect(sig) );
    }

});


const DASHTOPANEL_UUID = 'dash-to-panel@jderose9.github.com';
let extensionChangedHandler, panelsChangedHandler;
let extensionSystem = (Main.extensionManager || imports.ui.extensionSystem);

function init() {
}

function enable() {
    _enableSinglePanel(Main.panel);

    if (global.dashToPanel) {
        _enableSecondaryPanels(global.dashToPanel.panels);
        _listenToDashToPanel();
    } else {
        extensionChangedHandler = extensionSystem.connect('extension-state-changed', (data, extension) => {
            if (extension.uuid === DASHTOPANEL_UUID && extension.state === 1) {
                _listenToDashToPanel();
            }
        });
    }
}

function _enableSinglePanel(panel) {
    if (panel.statusArea.NotificationCounter && panel.statusArea.NotificationCounter.active) {
        return;
    }

    let dateMenu = panel.statusArea.dateMenu;
    let dateMenuLayout = dateMenu.get_children()[0];
    let actors = dateMenuLayout.get_children();
    let orig_pad = actors[0];
    let orig_indicator = dateMenu._indicator;

    // Remove original pad
    dateMenuLayout.remove_child(orig_pad);
    orig_pad.destroy();

    // Remove original indicator
    dateMenuLayout.remove_child(orig_indicator);

    // Create new indicator
    let count_indicator = new MessageCounterIndicator();
    dateMenu._indicator = count_indicator;

    // Add it with pad and constraint
    // Have to create a new one, to unbind with original pad.
    let pad = new St.Widget();
    count_indicator.bind_property('visible', pad, 'visible', GObject.BindingFlags.SYNC_CREATE);
    pad.add_constraint(new Clutter.BindConstraint({
        source: count_indicator,
        coordinate: Clutter.BindCoordinate.SIZE,
    }));

    dateMenuLayout.add_child(count_indicator);
    dateMenuLayout.add_child(pad);
    dateMenuLayout.set_child_at_index(pad, 0);

    // Save manipulated objects, in case we need to restore them when disabling this extension.
    panel.statusArea.NotificationCounter = {
        active: true,
        dateMenu: dateMenu,
        orig_indicator: orig_indicator,
        count_indicator: count_indicator
    };
}

function _enableSecondaryPanels(panels) {
    panels.slice(1).forEach(p => {
        _enableSinglePanel(p);
    });
}

function _listenToDashToPanel() {
    if (!panelsChangedHandler) {
        panelsChangedHandler = global.dashToPanel.connect('panels-created', () => {
            _enableSecondaryPanels(global.dashToPanel.panels);
        });
    }
}

function disable() {
    _disableSinglePanel(Main.panel);

    if (global.dashToPanel) {
        global.dashToPanel.panels.slice(1).forEach(p => {
            _disableSinglePanel(p);
        });

        if (panelsChangedHandler) {
            global.dashToPanel.disconnect(panelsChangedHandler);
            panelsChangedHandler = null;
        }
    }

    if (extensionChangedHandler) {
        extensionSystem.disconnect(extensionChangedHandler);
        extensionChangedHandler = null;
    }
}

function _disableSinglePanel(panel) {
    if (!panel.statusArea.NotificationCounter || !panel.statusArea.NotificationCounter.active) {
        return;
    }

    let dateMenu = panel.statusArea.NotificationCounter.dateMenu;
    let orig_indicator = panel.statusArea.NotificationCounter.orig_indicator;
    let count_indicator = panel.statusArea.NotificationCounter.count_indicator;

    let dateMenuLayout = dateMenu.get_children()[0];
    let old_pad = dateMenuLayout.get_children()[0];

    // Remove
    dateMenuLayout.remove_child(old_pad);
    dateMenuLayout.remove_child(count_indicator);
    old_pad.destroy();
    count_indicator.destroy();

    // Add original indicator
    dateMenuLayout.add_child(orig_indicator);
    dateMenu._indicator = orig_indicator;

    // add the pad and constraint back
    let pad = new St.Widget();
    dateMenu._indicator.bind_property('visible', pad, 'visible', GObject.BindingFlags.SYNC_CREATE);
    pad.add_constraint(new Clutter.BindConstraint({
        source: orig_indicator,
        coordinate: Clutter.BindCoordinate.SIZE,
    }));
    dateMenuLayout.add_child(pad);
    dateMenuLayout.set_child_at_index(pad, 0);

    panel.statusArea.NotificationCounter = {
        active: false
    };
}
