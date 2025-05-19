// modules/TabBar.js

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

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
        this._tabs            = [];   // holds { window, actor }
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

        // Try to resolve a proper app name
        const wmClass   = window.get_wm_class();      // e.g. "org.gnome.Nautilus" or "google-chrome"
        const appSystem = Shell.AppSystem.get_default();
        let app         = appSystem.lookup_app(wmClass) ||
                          appSystem.lookup_app(`${wmClass}.desktop`) ||
                          appSystem.lookup_app(wmClass.toLowerCase()) ||
                          appSystem.lookup_app(`${wmClass.toLowerCase()}.desktop`);

        let label;
        if (app) {
            label = app.get_name();
        } else if (wmClass) {
            // Title-case a hyphen/underscore-separated class as a fallback
            label = wmClass
                .replace(/[-_.]+/g, ' ')
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        } else {
            // Last resort: the window's title
            label = window.get_title();
        }

        const tab = new St.Button({
            style_class: 'zone-tab',
            label:       label,
            reactive:    true,
            x_expand:    false,
            y_expand:    false,
        });

        // Apply dynamic font size from settings
        const fontSize = this._settingsManager.getTabFontSize();
        tab.set_style(`font-size: ${fontSize}px;`);

        tab.connect('button-press-event', () => {
            this._onTabClicked(window);
            return Clutter.EVENT_STOP;
        });

        this.add_child(tab);
        this._tabs.push({ window, actor: tab });
        this.visible = true;
        this.highlightWindow(window);
    }

    /**
     * Removes the tab for `window`.
     * @param {Meta.Window} window
     */
    removeWindow(window) {
        const idx = this._tabs.findIndex(t => t.window === window);
        if (idx >= 0) {
            const { actor } = this._tabs[idx];
            this.remove_child(actor);
            this._tabs.splice(idx, 1);
        }
        if (this._tabs.length === 0) {
            this.visible = false;
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
        if (this.get_parent())
            this.get_parent().remove_child(this);
        super.destroy();
    }
}

