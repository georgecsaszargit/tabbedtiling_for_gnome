// modules/TabBar.js

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
// Meta is not strictly needed here for signals if we use the window object directly,
// but it's good to keep if other Meta properties were accessed.

// Helper for logging within TabBar
const tbLog = (zoneId, msg) => {
    let zId = typeof zoneId === 'string' && zoneId.startsWith('{') ? 'JSON_Zone' : zoneId;
    console.log(`[AutoZoner.TabBar (${zId})] ${msg}`);
};

/**
 * A horizontal tab bar for a single zone.
 * Shows one button per window, highlighting the active one.
 */
export class TabBar extends St.BoxLayout {
    static {
        GObject.registerClass(this);
    }

    /**
     * @param {string} zoneId
     * @param {function(Meta.Window)} onTabClicked
     * @param {object} settingsManager
     */
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
        this._tabs            = [];   // holds { window, actor, unmanagingSignalId, labelText }
        this.visible          = false;
        this.opacity          = 255;
    }

    /**
     * Adds a tab for `window`, or just highlights if already present.
     * @param {Meta.Window} window
     */
    addWindow(window) {
        if (this._tabs.some(t => t.window === window)) {
            this.highlightWindow(window);
            return;
        }

        const wmClass   = window.get_wm_class();
        const appSystem = Shell.AppSystem.get_default();
        let app         = appSystem.lookup_app(wmClass) ||
                          appSystem.lookup_app(`${wmClass}.desktop`) ||
                          appSystem.lookup_app(wmClass.toLowerCase()) ||
                          appSystem.lookup_app(`${wmClass.toLowerCase()}.desktop`);

        let labelText;
        if (app) {
            labelText = app.get_name();
        } else if (wmClass) {
            labelText = wmClass
                .replace(/[-_.]+/g, ' ')
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        } else {
            labelText = window.get_title() || 'Untitled Window';
        }

        const tabActor = new St.Button({
            style_class: 'zone-tab',
            label:       labelText,
            reactive:    true,
            x_expand:    false,
            y_expand:    false,
        });

        const fontSize = this._settingsManager.getTabFontSize();
        tabActor.set_style(`font-size: ${fontSize}px;`);

        const onTabPress = () => {
            this._onTabClicked(window);
            return Clutter.EVENT_STOP;
        };
        tabActor.connect('button-press-event', onTabPress);

        // Listen for window unmanaging (the correct signal for closure)
        const unmanagingSignalId = window.connect('unmanaging', (metaWindow) => {
            // metaWindow is the window emitting the signal, same as 'window' in this scope
            tbLog(this._zoneId, `Window "${metaWindow.get_title()}" (Label: "${labelText}") is unmanaging. Removing tab.`);
            this._onWindowUnmanaging(metaWindow);
        });

        this.add_child(tabActor);
        this._tabs.push({ window, actor: tabActor, unmanagingSignalId, labelText });
        this.visible = true;
        this.highlightWindow(window);
        tbLog(this._zoneId, `Added tab for "${labelText}". Total tabs: ${this._tabs.length}`);
    }

    _onWindowUnmanaging(unmanagingWindow) {
        const idx = this._tabs.findIndex(t => t.window === unmanagingWindow);
        if (idx >= 0) {
            const { actor, labelText } = this._tabs[idx];
            // The signal is firing, so the 'unmanagingSignalId' for this window is now "spent".
            // We don't need to explicitly disconnect it from unmanagingWindow as it's going away.
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

    /**
     * Removes the tab for `window`. (e.g. when unsnapped, not self-closed)
     * @param {Meta.Window} window
     */
    removeWindow(window) {
        const idx = this._tabs.findIndex(t => t.window === window);
        if (idx >= 0) {
            const { actor, unmanagingSignalId, labelText } = this._tabs[idx];

            if (unmanagingSignalId && window) {
                // If window is still alive and we have a signal ID, disconnect our 'unmanaging' listener
                // It's good practice, though 'unmanaging' only fires once.
                try {
                    window.disconnect(unmanagingSignalId);
                } catch (e) {
                    tbLog(this._zoneId, `Error disconnecting window unmanaging signal for "${labelText}": ${e.message}`);
                }
            }

            this.remove_child(actor);
            actor.destroy(); // Destroy the St.Button actor
            this._tabs.splice(idx, 1);
            tbLog(this._zoneId, `Explicitly removed tab for "${labelText}". Remaining tabs: ${this._tabs.length}`);
        }
        if (this._tabs.length === 0) {
            this.visible = false;
            tbLog(this._zoneId, "Became empty after removeWindow, hiding TabBar.");
        }
    }

    /**
     * Highlights only the tab corresponding to `window`.
     * @param {Meta.Window} window
     */
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
            if (window && unmanagingSignalId) {
                // Disconnect any remaining 'unmanaging' listeners
                // Check if window is already destroyed to prevent errors, though 'unmanaging' should only fire once.
                // A simple try-catch is often sufficient if window might be gone.
                try {
                    window.disconnect(unmanagingSignalId);
                } catch (e) {
                    // tbLog(this._zoneId, `Error disconnecting window unmanaging signal for "${labelText}" during TabBar destroy: ${e.message}`);
                    // This error is common if the window is already gone, can be ignored.
                }
            }
            actor.destroy(); // Destroy the tab actor
        });
        this._tabs = [];

        if (this.get_parent()) {
            this.get_parent().remove_child(this);
        }
        super.destroy();
        tbLog(this._zoneId, "TabBar destroyed fully.");
    }
}
