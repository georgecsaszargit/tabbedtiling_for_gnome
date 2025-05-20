// modules/TabBar.js

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell'; // Needed for Shell.AppSystem and Shell.WindowTracker

const tbLog = (zoneId, msg) => {
    let zId = typeof zoneId === 'string' && zoneId.startsWith('{') ? 'JSON_Zone' : zoneId;
    console.log(`[AutoZoner.TabBar (${zId})] ${msg}`);
};

export class TabBar extends St.BoxLayout {
    static {
        GObject.registerClass(this);
    }

    constructor(zoneId, onTabClicked, settingsManager) {
        super({
            style_class: 'zone-tab-bar',
            vertical: false,
            x_expand: true,
            y_expand: false,
            reactive: true,
        });
        this._zoneId          = zoneId;
        this._onTabClicked    = onTabClicked;
        this._settingsManager = settingsManager;
        this._tabs            = [];
        this.visible          = false;
        this.opacity          = 255;
        // Get WindowTracker once
        this._windowTracker = Shell.WindowTracker.get_default();
    }

    addWindow(window) {
        if (this._tabs.some(t => t.window === window)) {
            this.highlightWindow(window);
            return;
        }

        const app = this._windowTracker.get_window_app(window);

        let labelText;
        if (app) {
            labelText = app.get_name() || window.get_title() || 'Untitled Window';
        } else {
            const wmClass = window.get_wm_class();
            if (wmClass) {
                labelText = wmClass
                    .replace(/[-_.]+/g, ' ')
                    .split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ') || window.get_title() || 'Untitled Window';
            } else {
                labelText = window.get_title() || 'Untitled Window';
            }
        }

        const tabButton = new St.Button({
            style_class: 'zone-tab',
            reactive: true,
        });

        const tabContentBox = new St.BoxLayout({
            vertical: false,
        });
        tabButton.set_child(tabContentBox);

        let appIconActor = null;
        if (app) {
            const gicon = app.get_icon();
            if (gicon) {
                appIconActor = new St.Icon({
                    gicon: gicon,
                    icon_size: 24,
                    style_class: 'zone-tab-app-icon'
                });
                tabContentBox.add_child(appIconActor);
            }
        }

        const fontSize = this._settingsManager.getTabFontSize();
        const titleLabel = new St.Label({
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER,
        });
        let titleStyle = `font-size: ${fontSize}px;`;
        if (appIconActor) {
            titleStyle += ' margin-left: 5px;';
        }
        titleLabel.set_style(titleStyle);
        tabContentBox.add_child(titleLabel);

        const onTabPress = () => {
            this._onTabClicked(window);
            return Clutter.EVENT_STOP;
        };
        tabButton.connect('button-press-event', onTabPress);

        const unmanagingSignalId = window.connect('unmanaging', (metaWindow) => {
            tbLog(this._zoneId, `Window "${metaWindow.get_title() || labelText}" is unmanaging. Removing tab.`);
            this._onWindowUnmanaging(metaWindow);
        });

        this.add_child(tabButton);
        this._tabs.push({ window, actor: tabButton, unmanagingSignalId, labelText });
        this.visible = true;
        this.highlightWindow(window);
        tbLog(this._zoneId, `Added tab for "${labelText}". Total tabs: ${this._tabs.length}`);
    }

    _onWindowUnmanaging(unmanagingWindow) {
        const idx = this._tabs.findIndex(t => t.window === unmanagingWindow);
        if (idx >= 0) {
            const { actor, labelText } = this._tabs[idx];
            // Note: unmanagingSignalId is automatically disconnected when 'actor' (the St.Button) is destroyed,
            // if 'window' was the source of the signal and actor was its direct handler.
            // However, since 'window' is the source and 'this._onWindowUnmanaging' is the callback,
            // the signal connection is on 'window' itself. It should be explicitly disconnected if 'window' isn't destroyed with the actor.
            // But 'unmanaging' means the window *is* going away, so further access might be risky.
            // The signal is on `window` object, `disconnect` was correct.
            // The `unmanagingSignalId` is already disconnected automatically by GObject when `unmanagingWindow` is finalized.
            // Explicitly removing it before actor destruction is good practice if there's any doubt.
            // However, the main issue is accessing a potentially invalid 'unmanagingWindow' object.
            // At this point, 'unmanagingWindow' is emitting 'unmanaging', so it's still valid for this callback.
            this.remove_child(actor);
            actor.destroy();
            this._tabs.splice(idx, 1);
            tbLog(this._zoneId, `Tab for unmanaged window "${labelText}" removed. Remaining tabs: ${this._tabs.length}`);
            if (this._tabs.length === 0) {
                this.visible = false;
                tbLog(this._zoneId, "Became empty, hiding TabBar.");
            }
        } else {
            tbLog(this._zoneId, `Window "${unmanagingWindow.get_title()}" was unmanaged but not found in tabs list.`);
        }
    }

    removeWindow(window) {
        const idx = this._tabs.findIndex(t => t.window === window);
        if (idx >= 0) {
            const { actor, unmanagingSignalId, labelText } = this._tabs[idx];
            if (unmanagingSignalId && window) { // Check if window is not null
                try {
                    window.disconnect(unmanagingSignalId);
                } catch (e) {
                    tbLog(this._zoneId, `Error disconnecting window unmanaging signal for "${labelText}" during removeWindow: ${e.message}`);
                }
            }
            this.remove_child(actor);
            actor.destroy();
            this._tabs.splice(idx, 1);
            tbLog(this._zoneId, `Explicitly removed tab for "${labelText}". Remaining tabs: ${this._tabs.length}`);
        }
        if (this._tabs.length === 0) {
            this.visible = false;
            tbLog(this._zoneId, "Became empty after removeWindow, hiding TabBar.");
        }
    }

    highlightWindow(window) {
        this._tabs.forEach(({ window: w, actor }) => {
            if (w === window)
                actor.add_style_class_name('active');
            else
                actor.remove_style_class_name('active');
        });
    }

    destroy() {
        tbLog(this._zoneId, "Destroying TabBar...");
        this._tabs.forEach(({ window, actor, unmanagingSignalId, labelText }) => {
            if (window && unmanagingSignalId) { // Check if window is not null
                try {
                    window.disconnect(unmanagingSignalId);
                } catch (e) {
                    // tbLog(this._zoneId, `Error disconnecting window unmanaging signal for "${labelText}" during TabBar destroy: ${e.message}`);
                }
            }
            actor.destroy();
        });
        this._tabs = [];

        if (this.get_parent()) {
            this.get_parent().remove_child(this);
        }
        super.destroy();
        tbLog(this._zoneId, "TabBar destroyed fully.");
    }
}
